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

import { UserResponse } from './user-response';

/**
  * @typedef AuthenticationResponse
  * @property {UserResponse.model} user - The user that has authenticated.
  * @property {Array.<string>} roles - The RBAC roles that the user has.
  * @property {Array.<UserResponse.model>} organs - The organs that the user is a member of.
  * @property {string} token - The JWT token that can be used as Bearer token for authentication.
  */
export default interface AuthenticationResponse {
  user: UserResponse,
  roles: string[],
  organs: UserResponse[],
  token: string,
}
