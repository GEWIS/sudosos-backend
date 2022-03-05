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
import User from '../entity/user/user';
import JsonWebToken from '../authentication/json-web-token';
import AuthenticationResponse from '../controller/response/authentication-response';
import TokenHandler from '../authentication/token-handler';
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import RoleManager from '../rbac/role-manager';

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

  /**
   * Authenticates the given PIN against the stored PIN.
   * @param pin - code to check
   * @param authenticator - stored PinAuthenticator to check against
   * @param context - Authentication context for roles and token signing.
   * @constructor
   */
  public static async PINAuthentication(pin:string, authenticator: PinAuthenticator,
    context: AuthenticationContext): Promise<AuthenticationResponse> {
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
