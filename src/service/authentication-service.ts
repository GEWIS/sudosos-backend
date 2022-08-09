/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import bcrypt from 'bcrypt';
// @ts-ignore
import { filter } from 'ldap-escape';
import log4js, { Logger } from 'log4js';
import { EntityManager } from 'typeorm';
import User, { UserType } from '../entity/user/user';
import JsonWebToken from '../authentication/json-web-token';
import AuthenticationResponse from '../controller/response/authentication-response';
import TokenHandler from '../authentication/token-handler';
import RoleManager from '../rbac/role-manager';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import { asNumber } from '../helpers/validators';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import {
  bindUser, getLDAPConnection, getLDAPSettings, LDAPUser, userFromLDAP,
} from '../helpers/ad';
import { parseUserToResponse } from '../helpers/revision-to-response';
import HashBasedAuthenticationMethod from '../entity/authenticator/hash-based-authentication-method';

export interface AuthenticationContext {
  tokenHandler: TokenHandler,
  roleManager: RoleManager,
}

export default class AuthenticationService {
  /**
   * Amount of salt rounds to use.
   */
  private static BCRYPT_ROUNDS: number = asNumber(process.env.BCRYPT_ROUNDS) ?? 12;

  /**
   * Helper function hashes the given string with salt.
   * @param password - password to hash
   */
  private static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(AuthenticationService.BCRYPT_ROUNDS);
    return Promise.resolve(bcrypt.hash(password, salt));
  }

  /**
   * Returns all the ORGANS the user has rights over
   * @param user
   */
  private static async getUserOrgans(user: User) {
    const organs = (await MemberAuthenticator.find({ where: { user: { id: user.id } }, relations: ['authenticateAs'] })).map((organ) => organ.authenticateAs);
    return organs.filter((organ) => organ.type === UserType.ORGAN);
  }

  /**
   * Creates the corresponding token-content of the given user in the given context.
   * @param context - The tokenHandler and roleManager to be used.
   * @param user - The user for which to generate the token-content
   * @param lesser - If the token should give full access rights.
   */
  public static async makeJsonWebToken(
    context: AuthenticationContext, user: User, lesser: boolean,
  ): Promise<JsonWebToken> {
    const organs = await this.getUserOrgans(user);
    const roles = await context.roleManager.getRoles(user);
    // If a user is part of an organ he gains seller rights.
    if (organs.length > 0) roles.push('Seller');

    return {
      user,
      roles,
      organs,
      lesser,
    };
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
    roles: string[],
    organs: User[],
    token: string,
  ): AuthenticationResponse {
    return {
      user: parseUserToResponse(user, true),
      organs: organs.map((organ) => parseUserToResponse(organ, false)),
      roles,
      token,
      acceptedToS: user.acceptedToS,
    };
  }

  /**
   * Creates a new User and binds it to the ObjectGUID of the provided LDAPUser.
   * Function is ran in a single DB transaction in the context of an EntityManager
   * @param manager - The EntityManager context to use.
   * @param ADUser - The user for which to create a new account.
   */
  public static async createUserAndBind(manager: EntityManager, ADUser: LDAPUser): Promise<User> {
    let account = Object.assign(new User(), {
      firstName: ADUser.givenName,
      lastName: ADUser.sn,
      type: UserType.MEMBER,
      active: true,
    }) as User;

    let user: User;

    account = await manager.save(account);
    const auth = await bindUser(manager, ADUser, account);
    user = auth.user;
    console.error(user);
    return user;
  }

  /**
   * Generic function that sets a hash authentication of a user.
   * If the user has no Authentication set it will create the authentication.
   * @param user - The user for which to set the authentication
   * @param pass - Code to set
   * @param Type
   */
  public static async setUserAuthenticationHash<T extends HashBasedAuthenticationMethod>(user: User,
    pass: string, Type: { new(): T, findOne: any, save: any }): Promise<T> {
    let authenticator = await Type.findOne({ where: { user }, relations: ['user'] });
    const hash = await this.hashPassword(pass);

    if (authenticator) {
      // We only need to update the PIN
      authenticator.hash = hash;
    } else {
      // We must create the authenticator
      authenticator = Object.assign(new Type(), {
        user,
        hash,
      });
    }

    // Save and return
    await Type.save(authenticator);
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
  public static async HashAuthentication<T extends HashBasedAuthenticationMethod>(pass: string,
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
  public static async LDAPAuthentication(uid:string, password: string,
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
      });
      if (searchEntries[0]) {
        ADUser = userFromLDAP(searchEntries[0]);
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
    const authenticator = await LDAPAuthenticator.findOne({ where: { UUID: ADUser.objectGUID }, relations: ['user'] });

    // If there is no user associated with the GUID we create the user and bind it.
    return Promise.resolve(authenticator
      ? authenticator.user : await onNewUser(ADUser));
  }

  /**
   * Get a list of all users this user can authenticate as, including itself.
   * @param user
   */
  public static async getMemberAuthenticators(user: User): Promise<User[]> {
    const users = (await MemberAuthenticator.find({ where: { user: { id: user.id } }, relations: ['authenticateAs'] }))
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
  public static async setMemberAuthenticator(manager: EntityManager, users: User[],
    authenticateAs: User) {
    // First drop all rows containing authenticateAs
    // We check if there is anything to drop or else type orm will complain.
    const toRemove: MemberAuthenticator[] = await MemberAuthenticator
      .find({ where: { authenticateAs: { id: authenticateAs.id } } });

    if (toRemove.length !== 0) {
      await manager.delete(MemberAuthenticator, { authenticateAs });
    }

    const promises: Promise<MemberAuthenticator>[] = [];

    // Create MemberAuthenticator object for each user in users.
    users.forEach((user) => {
      const authenticator = Object.assign(new MemberAuthenticator(), {
        userId: user.id,
        authenticateAsId: authenticateAs.id,
      });
      promises.push(manager.save(authenticator));
    });

    await Promise.all(promises);
  }

  /**
   * Created a salted JWT token for the given userId.
   * @param user
   * @param context
   * @param lesser
   */
  public static async getSaltedToken(user: User, context: AuthenticationContext,
    lesser = true): Promise<AuthenticationResponse> {
    const contents = await this.makeJsonWebToken(context, user, lesser);
    const salt = await bcrypt.genSalt(AuthenticationService.BCRYPT_ROUNDS);
    const token = await context.tokenHandler.signToken(contents, salt);

    return this.asAuthenticationResponse(contents.user, contents.roles, contents.organs, token);
  }

  public static async compareHash(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
