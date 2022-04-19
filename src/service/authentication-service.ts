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
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import RoleManager from '../rbac/role-manager';
import LDAPAuthenticator, { LDAPUser } from '../entity/authenticator/ldap-authenticator';
import { asNumber } from '../helpers/validators';
import { parseUserToResponse } from '../helpers/entity-to-response';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import {
  bindUser, getLDAPConnection, getLDAPSettings, userFromLDAP,
} from '../helpers/ad';

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
     * Converts the internal object representation to an authentication response, which can be
     * returned in the API response.
     * @param user - The user that authenticated.
     * @param roles - The roles that the authenticated user has.
     * @param token - The JWT token that can be used to authenticate.
     * @returns The authentication response.
     */
  public static asAuthenticationResponse(
    user: User,
    roles: string[],
    token: string,
  ): AuthenticationResponse {
    return {
      user: parseUserToResponse(user, true),
      roles,
      token,
    };
  }

  /**
   * Creates a new User and binds it to the ObjectGUID of the provided LDAPUser.
   * Function is ran in a single DB transaction in the context of an EntityManager
   * @param ADUser - The user for which to create a new account.
   */
  public static async createUserAndBind(manager: EntityManager, ADUser: LDAPUser): Promise<User> {
    const account = Object.assign(new User(), {
      firstName: ADUser.givenName,
      lastName: ADUser.sn,
      type: UserType.MEMBER,
      active: true,
    }) as User;

    let user: User;

    await manager.save(account).then(async (acc) => {
      const auth = await bindUser(manager, ADUser, acc);
      user = auth.user;
    });

    return user;
  }

  /**
   * Set the PIN code of a user.
   * If the user has no PIN Authentication set it will create the authentication.
   * @param user - The user for which to set the PIN
   * @param pin - PIN Code to set, must be a valid 4 number string.
   */
  public static async setUserPINCode(user: User, pin: string): Promise<PinAuthenticator> {
    let authenticator = await PinAuthenticator.findOne({ where: { user } });
    const hashedPin = await this.hashPassword(pin);

    if (authenticator) {
      // We only need to update the PIN
      authenticator.hashedPin = hashedPin;
    } else {
      // We must create the authenticator
      authenticator = Object.assign(new PinAuthenticator(), {
        user,
        hashedPin,
      });
    }

    // Save and return
    await PinAuthenticator.save(authenticator);
    return authenticator;
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

    if (!client) {
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
      .find({ where: { authenticateAs } });

    if (toRemove.length !== 0) {
      await manager.delete(MemberAuthenticator, { authenticateAs });
    }

    const promises: Promise<MemberAuthenticator>[] = [];

    // Create MemberAuthenticator object for each user in users.
    users.forEach((user) => {
      const authenticator = Object.assign(new MemberAuthenticator(), {
        user,
        authenticateAs,
      });
      promises.push(manager.save(authenticator));
    });

    await Promise.all(promises);
  }

  /**
   * Authenticates the given PIN against the stored PIN.
   * @param pin - code to check
   * @param authenticator - stored PinAuthenticator to check against
   * @param context - Authentication context for roles and token signing.
   * @constructor
   */
  public static async PINAuthentication(pin:string, authenticator: PinAuthenticator,
    context: AuthenticationContext): Promise<AuthenticationResponse | undefined> {
    const valid = await this.compareHash(pin, authenticator.hashedPin);
    if (!valid) return undefined;

    return this.getSaltedToken(authenticator.user, context, true);
  }

  /**
   * Created a salted JWT token for the given userId.
   * @param user
   * @param context
   * @param lesser
   */
  public static async getSaltedToken(user: User, context: AuthenticationContext,
    lesser = true): Promise<AuthenticationResponse> {
    const roles = await context.roleManager.getRoles(user);

    const contents: JsonWebToken = {
      user,
      roles,
      lesser,
    };

    const salt = await bcrypt.genSalt(AuthenticationService.BCRYPT_ROUNDS);
    const token = await context.tokenHandler.signToken(contents, salt);
    return this.asAuthenticationResponse(user, roles, token);
  }

  public static async compareHash(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
