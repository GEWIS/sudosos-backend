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
 */

export default interface GewiswebToken {
  /**
   * JWT token issuer.
   */
  iss: string,
  /**
   * The GEWIS membership number.
   */
  lidnr: number,
  /**
   * The user's email
   */
  email: string,
  /**
   * The given surname or last name
   */
  family_name: string,
  /**
   * The given name or first name
   */
  given_name: string,
  /**
   * Boolean whether the mebmer is 18+
   */
  is_18_plus: boolean,
  /**
   * The member's middle name
   */
  middle_name: string,
  /**
   * The JWT expiration timestamp.
   */
  exp: number,
  /**
   * The JWT issued at timestamp.
   */
  iat: number,
  /**
   * A nonce for the JWT token.
   */
  nonce: string
}
