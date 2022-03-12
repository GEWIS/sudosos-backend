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
import { Client } from 'ldapts';
// @ts-ignore
import { filter } from 'ldap-escape';
import log4js, { Logger } from 'log4js';
import User, { UserType } from '../entity/user/user';
import JsonWebToken from '../authentication/json-web-token';
import AuthenticationResponse from '../controller/response/authentication-response';
import TokenHandler from '../authentication/token-handler';
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import RoleManager from '../rbac/role-manager';
import LDAPAuthenticator, { LDAPUser } from '../entity/authenticator/ldap-authenticator';

const BCRYPT_ROUNDS = 12;

export interface AuthenticationContext {
  tokenHandler: TokenHandler,
  roleManager: RoleManager,
}

export default class AuthenticationService {
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
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        active: user.active,
        deleted: user.deleted,
        type: user.type,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      roles,
      token,
    };
  }

  private static getLDAPSettings() {
    return {
      url: process.env.LDAP_SERVER_URL,
      reader: process.env.LDAP_BIND_USER,
      readerPassword: process.env.LDAP_BIND_PW,
      base: process.env.LDAP_BASE,
      userFilter: process.env.LDAP_USER_FILTER,
    };
  }

  private static userFromLDAP(ldapResult: any): LDAPUser {
    const {
      dn, memberOfFlattened, givenName, sn,
      objectGUID, sAMAccountName, mail,
    } = ldapResult;
    return {
      dn,
      memberOfFlattened,
      givenName,
      sn,
      objectGUID,
      sAMAccountName,
      mail,
    };
  }

  public static async createUserAndBind(ADUser: LDAPUser): Promise<User> {
    // TODO Make this a single database transaction
    const account = Object.assign(new User(), {
      firstName: ADUser.givenName,
      lastName: ADUser.sn,
      type: UserType.MEMBER,
      active: true,
    }) as User;

    let user: User;
    await User.save(account).then(async (acc) => {
      // Bind the user to the newly created account
      const auth = Object.assign(new LDAPAuthenticator(), {
        user: acc,
        UUID: ADUser.objectGUID,
      }) as LDAPAuthenticator;

      await LDAPAuthenticator.save(auth).then((a) => {
        user = a.user;
      });
    });

    return user;
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
    const logger: Logger = log4js.getLogger('LDAPAuthentication');
    const ldapSettings = this.getLDAPSettings();

    const client = new Client({
      url: ldapSettings.url,
    });

    // replace all appearances of %u with uid
    const replacerUid = new RegExp('%u', 'g');

    const filterstr = ldapSettings.userFilter.replace(replacerUid, filter`${uid}`);

    // Bind LDAP Reader
    try {
      await client.bind(ldapSettings.reader, ldapSettings.readerPassword);
    } catch (error) {
      logger.error(`Could not bind LDAP reader: ${ldapSettings.reader} err: ${String(error)}`);
      return undefined;
    }

    let ADUser: LDAPUser;
    // Get user data
    try {
      const { searchEntries } = await client.search(ldapSettings.base, {
        scope: 'sub',
        filter: filterstr,
      });
      if (searchEntries[0]) {
        ADUser = this.userFromLDAP(searchEntries[0]);
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
    return Promise.resolve(authenticator
      ? authenticator.user : await onNewUser.bind(this)(ADUser));
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

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const token = await context.tokenHandler.signToken(contents, salt);
    return this.asAuthenticationResponse(user, roles, token);
  }

  public static async compareHash(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
