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
 * This is the module page of the authentication-secure-pin-request.
 *
 * @module authentication
 */

/**
 * @typedef {object} AuthenticationSecurePinRequest
 * @property {number} userId.required
 * @property {string} pin.required
 * @property {number} posId.required - POS identifier (required for secure authentication)
 */
export default interface AuthenticationSecurePinRequest {
  userId: number,
  pin: string,
  posId: number,
}

