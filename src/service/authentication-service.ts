/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */

/**
 * This is the module page of the authentication-service.
 *
 * @module authentication
 */

import bcrypt from 'bcrypt';
// @ts-ignore
import {filter} from 'ldap-escape';
import log4js, {Logger} from 'log4js';
import {FindOptionsWhere, In} from 'typeorm';
import {randomBytes} from 'crypto';
import User, {LocalUserTypes, UserType} from '../entity/user/user';
import JsonWebToken from '../authentication/json-web-token';
import AuthenticationResponse from '../controller/response/authentication-response';
import TokenHandler from '../authentication/token-handler';
import RoleManager from '../rbac/role-manager';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import {bindUser, getLDAPConnection, getLDAPSettings, LDAPResult, LDAPUser, userFromLDAP,} from '../helpers/ad';
import {parseUserToResponse} from '../helpers/revision-to-response';
import HashBasedAuthenticationMethod from '../entity/authenticator/hash-based-authentication-method';
import ResetToken from '../entity/authenticator/reset-token';
import LocalAuthenticator from '../entity/authenticator/local-authenticator';
import AuthenticationResetTokenRequest from '../controller/request/authentication-reset-token-request';
import NfcAuthenticator from '../entity/authenticator/nfc-authenticator';
import RBACService from './rbac-service';
import Role from '../entity/rbac/role';
import WithManager from '../database/with-manager';
import UserService from "./user-service";

export interface AuthenticationContext {
  tokenHandler: TokenHandler,
  roleManager: RoleManager,
}

export interface ResetTokenInfo {
  resetToken: ResetToken,
  password: string,
}

export default class AuthenticationService extends WithManager {
  /**
   * Amount of salt rounds to use.
   */
  private static BCRYPT_ROUNDS: number = parseInt(process.env.BCRYPT_ROUNDS, 10) ?? 12;

  /**
   * ResetToken expiry time in seconds
   */
  private RESET_TOKEN_EXPIRES: () => number =
    () => {
      const env = parseInt(process.env.RESET_TOKEN_EXPIRES, 10);
      return Number.isNaN(env) ? 3600 : env;
    };

  /**
   * Helper function hashes the given string with salt.
   * @param password - password to hash
   */
  public async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(AuthenticationService.BCRYPT_ROUNDS);
    return Promise.resolve(bcrypt.hash(password, salt));
  }

  /**
   * Creates the corresponding token-content of the given user in the given context.
   * @param user - The user for which to generate the token-content
   * @param roles - The roles this user has
   * @param organs - The organs this user belongs to
   * @param lesser - If the token should give full access rights.
   * @param overrideMaintenance - If the token should be able to access all endpoints
   * in maintenance mode
   */
  public async makeJsonWebToken(
    user: User, roles: Role[], organs: User[], lesser: boolean, overrideMaintenance: boolean,
  ): Promise<JsonWebToken> {

    return {
      user,
      roles: roles.map((r) => r.name),
      organs,
      lesser,
      overrideMaintenance,
    };
  }

  /**
   * Function that checks if the provided request corresponds to a valid reset token in the DB.
   * @param request
   */
  public async isResetTokenRequestValid(request: AuthenticationResetTokenRequest):
  Promise<ResetToken | undefined> {
    const user = await User.findOne({
      where: { email: request.accountMail, deleted: false, type: In(LocalUserTypes) },
    });
    if (!user) return undefined;

    const resetToken = await ResetToken.findOne({ where: { user: { id: user.id } }, relations: ['user'] });
    if (!resetToken) return undefined;

    // Test if the hash matches the token
    if (!(await this.compareHash(request.token, resetToken.hash))) return undefined;

    return resetToken;
  }

  public static isTokenExpired(resetToken: ResetToken) {
    return (resetToken.expires <= new Date());
  }

  /**
   * Converts the internal object representation to an authentication response, which can be
   * returned in the API response.
   * @param user - The user that authenticated.
   * @param roles - The roles that the authenticated user has.
   * @param organs - The organs that the user is part of.
   * @param token - The JWT token that can be used to authenticate.
   * @returns The authentication response.
   */
  public static asAuthenticationResponse(
    user: User,
    roles: Role[],
    organs: User[],
    token: string,
  ): AuthenticationResponse {
    return {
      user: parseUserToResponse(user, true),
      organs: organs.map((organ) => parseUserToResponse(organ, false)),
      roles: roles.map((r) => r.name),
      token,
      acceptedToS: user.acceptedToS,
      rolesWithPermissions: roles.map((r) => RBACService.asRoleResponse(r)),
    };
  }

  /**
   * Creates a new User and binds it to the ObjectGUID of the provided LDAPUser.
   * Function is ran in a single DB transaction in the context of an EntityManager
   * @param ADUser - The user for which to create a new account.
   */
  public async createUserAndBind(ADUser: LDAPUser): Promise<User> {
    let account = Object.assign(new User(), {
      firstName: ADUser.givenName,
      lastName: ADUser.sn,
      type: UserType.MEMBER,
      active: true,
      canGoIntoDebt: true,
      ofAge: false,
    } as User) as User;

    account = await this.manager.save(User, account);
    const auth = await bindUser(this.manager, ADUser, account);
    return auth.user;
  }

  /**
   * Generic function that sets a hash authentication of a user.
   * If the user has no Authentication set it will create the authentication.
   * @param user - The user for which to set the authentication
   * @param pass - Code to set
   * @param Type
   */
  public async setUserAuthenticationHash<T extends HashBasedAuthenticationMethod>(user: User,
    pass: string, Type: new () => T): Promise<T> {
    const repo = this.manager.getRepository(Type);
    let authenticator = await repo.findOne({ where: { user: { id: user.id } } as FindOptionsWhere<T>, relations: ['user'] });
    const hash = await this.hashPassword(pass);

    if (authenticator) {
      // We only need to update the hash
      authenticator.hash = hash;
    } else {
      // We must create the authenticator
      authenticator = Object.assign(new Type(), {
        user,
        hash,
      });
    }

    // Save and return
    await repo.save(authenticator as any);
    return authenticator;
  }

  public async setUserAuthenticationNfc<T extends NfcAuthenticator>(user: User,
    nfcCode: string, Type: new () => T): Promise<T> {
    const repo = this.manager.getRepository(Type);
    let authenticator = await repo.findOne({ where: { user: { id: user.id } } as FindOptionsWhere<T>, relations: ['user'] });

    if (authenticator) {
      // We only need to update the nfcCode
      authenticator.nfcCode = nfcCode;
    } else {
      // We must create the authenticator
      authenticator = Object.assign(new Type(), {
        user,
        nfcCode: nfcCode,
      });
    }

    // Save and return
    await repo.save(authenticator as any);
    return authenticator;
  }



  /**
   * Authenticates the account against a local password
   * @param pass - The provided password
   * @param authenticator - The stored authentication
   * @param context - AuthenticationContext to use
   * @param lesser
   * @constructor
   */
  public async HashAuthentication<T extends HashBasedAuthenticationMethod>(pass: string,
    authenticator: T, context: AuthenticationContext, lesser = true)
    : Promise<AuthenticationResponse | undefined> {
    const valid = await this.compareHash(pass, authenticator.hash);
    if (!valid) return undefined;

    return this.getSaltedToken(authenticator.user, context, lesser);
  }

  /**
   * Authenticates the account against the AD
   * @param uid - The AD account name.
   * @param password - The password user for authentication.
   * @param onNewUser - Callback function when user does not exist in local system.
   * @constructor
   */
  public async LDAPAuthentication(uid:string, password: string,
    onNewUser: (ADUser: LDAPUser) => Promise<User>): Promise<User | undefined> {
    const logger: Logger = log4js.getLogger('LDAP');
    logger.level = process.env.LOG_LEVEL;

    const ldapSettings = getLDAPSettings();
    const client = await getLDAPConnection();

    if (!client || password === '') {
      return undefined;
    }

    // replace all appearances of %u with uid
    const replacerUid = new RegExp('%u', 'g');

    const filterstr = ldapSettings.userFilter.replace(replacerUid, filter`${uid}`);

    let ADUser: LDAPUser;
    // Get user data
    try {
      const { searchEntries } = await client.search(ldapSettings.base, {
        scope: 'sub',
        filter: filterstr,
        explicitBufferAttributes: ['objectGUID'],
      });
      if (searchEntries[0]) {
        ADUser = userFromLDAP(searchEntries[0] as any as LDAPResult);
      } else {
        logger.trace(`User ${uid} not found in DB`);
        return undefined;
      }
    } catch (error) {
      logger.error(`Could not get user data during: ${String(error)}`);
      await client.unbind();
      return undefined;
    }

    // EXTRACT ROLES FROM GROUPS
    if (ADUser.mail === '' || ADUser.dn === '' || !ADUser) {
      logger.trace(`User ${ADUser.dn} is invalid`);
      return undefined;
    }

    // Bind user.
    try {
      await client.bind(ADUser.dn, password);
    } catch (ex) {
      logger.trace(`Could not bind User: ${uid} err: ${String(ex)}`);
      return undefined;
    } finally {
      await client.unbind();
    }

    // At this point the user is authenticated.
    const authenticator = await this.manager.findOne(LDAPAuthenticator, { where: { UUID: ADUser.objectGUID }, relations: ['user'] });

    // If there is no user associated with the GUID we create the user and bind it.
    if (authenticator) {
      if (authenticator.user.type == UserType.LOCAL_USER) {
        await UserService.updateUser(authenticator.user.id, {canGoIntoDebt: true, type: UserType.MEMBER});
      }

      return authenticator.user;
    }
    return onNewUser(ADUser);
  }

  /**
   * Get a list of all users this user can authenticate as, including itself.
   * @param user
   */
  public async getMemberAuthenticators(user: User): Promise<User[]> {
    const users = (await this.manager.find(MemberAuthenticator, { where: { user: { id: user.id } }, relations: ['authenticateAs'] }))
      .map((auth) => auth.authenticateAs);

    users.push(user);
    return users;
  }

  /**
   * Gives the array of users access to the authenticateAs user.
   * Used for shared accounts. Note that this replaces the
   * existing authentication for this authenticateAs.
   * @param manager - EntityManager used for single transaction.
   * @param users - The users that gain access.
   * @param authenticateAs - The account that needs to be accessed.
   */
  public async setMemberAuthenticator(users: User[], authenticateAs: User) {
    // First drop all rows containing authenticateAs
    // We check if there is anything to drop or else type orm will complain.
    const toRemove: MemberAuthenticator[] = await this.manager
      .find(MemberAuthenticator, { where: { authenticateAs: { id: authenticateAs.id } } });

    if (toRemove.length !== 0) {
      await this.manager.delete(MemberAuthenticator, { authenticateAs });
    }

    const promises: Promise<MemberAuthenticator>[] = [];

    // Create MemberAuthenticator object for each user in users.
    users.forEach((user) => {
      const authenticator = Object.assign(new MemberAuthenticator(), {
        userId: user.id,
        authenticateAsId: authenticateAs.id,
      });
      promises.push(this.manager.save(MemberAuthenticator, authenticator));
    });

    await Promise.all(promises);
  }

  /**
   * Resets the user local authenticator if token matches stored hash
   * @param resetToken - The stored reset token
   * @param token - Passcode of the reset token
   * @param newPassword - New password to set for the authentication
   */
  public async resetLocalUsingToken(resetToken: ResetToken,
    token: string, newPassword: string): Promise<LocalAuthenticator | undefined> {
    const auth = await this.setUserAuthenticationHash(
      resetToken.user, newPassword, LocalAuthenticator,
    );
    await this.manager.delete(ResetToken, resetToken.userId);
    return auth;
  }

  /**
   * Creates a ResetToken for the given user.
   * @param user
   */
  public async createResetToken(user: User): Promise<ResetTokenInfo> {
    const password = randomBytes(32).toString('hex');
    const resetToken = await this.setUserAuthenticationHash(user, password, ResetToken);

    const expiration = new Date().getTime() + this.RESET_TOKEN_EXPIRES() * 1000;
    resetToken.expires = new Date(expiration);
    await resetToken.save();

    return {
      resetToken,
      password,
    };
  }

  /**
   * Created a salted JWT token for the given userId.
   * @param user
   * @param context
   * @param lesser
   * @param salt
   * @param expiry Custom expiry time (in seconds). If not set,
   * the default tokenHandler expiry will be used
   */
  public async getSaltedToken(
    user: User, context: AuthenticationContext, lesser = true, salt?: string, expiry?: number,
  ): Promise<AuthenticationResponse> {
    const [roles, organs] = await Promise.all([
      context.roleManager.getRoles(user, true),
      context.roleManager.getUserOrgans(user),
    ]);
    const roleNames = roles.map((r)  => r.name);
    const overrideMaintenance = await context.roleManager.can(roleNames, 'override', 'all', 'Maintenance', ['*']);
    const contents = await this.makeJsonWebToken(user, roles, organs, lesser, overrideMaintenance);
    if (!salt) salt = await bcrypt.genSalt(AuthenticationService.BCRYPT_ROUNDS);
    const token = await context.tokenHandler.signToken(contents, salt, expiry);

    return AuthenticationService.asAuthenticationResponse(contents.user, roles, contents.organs, token);
  }

  public async compareHash(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
