/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the gewis-authentication-secure-pin-request.
 *
 * @module GEWIS
 */

/**
 * @typedef {object} GEWISAuthenticationSecurePinRequest
 * @property {number} gewisId.required
 * @property {string} pin.required
 * @property {number} posId.required - POS identifier
 */
export default interface GEWISAuthenticationSecurePinRequest {
  gewisId: number,
  pin: string,
  posId: number,
}

