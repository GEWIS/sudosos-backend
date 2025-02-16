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
 * Authentication within SudoSOS is based around [JWT tokens](https://jwt.io/). However, there are many ways to retrieve
 * a  JWT token, and the token itself is not stored in SudoSOS. Instead, the token is stored in the user's browser,
 * and is sent with every request to SudoSOS.
 *
 * The received JWT token is then validated by SudoSOS. If the token is valid, the api request is authorized and is processed.
 *
 * To retrieve a JWT token, a user can use one of the following methods:
 * - {@link GewiswebAuthenticationRequest | GEWIS Web Authentication}.
 * - {@link PinAuthenticator | PIN Authentication}.
 * - {@link LDAPAuthenticator | LDAP Authentication}.
 * - {@link NfcAuthenticator | NFC Authentication}.
 * - {@link KeyAuthenticator | API Key Authentication}.
 * - {@link EanAuthenticator | EAN (barcode) authentication}.
 *
 * Most of these methods are a {@link HashBasedAuthenticationMethod | hash-based authentication method}, where a secret is hashed and stored in the database,
 * and later compared against the input of the user.
 *
 * @module authentication
 * @mergeTarget
 */

/**
 * Test test!
 * @document ..\..\docs\content\test.md
 * @module authentication
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
