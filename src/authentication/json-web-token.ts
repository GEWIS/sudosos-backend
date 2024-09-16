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

import User from '../entity/user/user';

/**
 * The contents of the JWT used for user authentication.
 */
export default class JsonWebToken {
  /**
   * The token holds a reference to the user to which this token belongs.
   */
  public user: User;

  /**
   * The roles that are assigned to the specific user.
   */
  public roles: string[];

  /**
   * If the JWT token provides restricted acces.
   */
  public lesser: boolean;

  /**
   * Whether this token should still be able to access
   * all endpoints in maintenance mode
   */
  public overrideMaintenance?: boolean;

  /**
   * All the organs that the user is a part of.
   */
  public organs?: User[];

  /**
   * The JWT expiry field. Set automatically by signing the token.
   */
  public readonly iat?: number;

  /**
   * The JWT expiry field. Set automatically by signing the token.
   */
  public readonly exp?: number;

  /**
   * The JWT not-before field. Set automatically by signing the token.
   */
  public readonly nbf?: number;
}
