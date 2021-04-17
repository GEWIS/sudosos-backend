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

import User from '../../entity/user/user';

/**
  * @typedef BorrelkaartGroupResponse
  * @property {string} createdAt.required - Date of creation
  * @property {string} updateAt.required - Date of last update
  * @property {number} version.required - Version of the borrelkaart group
  * @property {number} id.required - Id of the borrelkaart group
  * @property {string} name.required - Name of the borrelkaart group
  * @property {string} activeStartDate - Start date of the borrelkaart group
  * @property {string} activeEndDate.required - End date of the borrelkaart group
  * @property {Array.<User>} users.required - Users in the borrelkaart group
  */
export default interface BorrelkaartGroupResponse {
  createdAt: string,
  updatedAt: string,
  version: number,
  id: number,
  name: string,
  activeStartDate?: string,
  activeEndDate: string,
  users: Array<User>,
}
