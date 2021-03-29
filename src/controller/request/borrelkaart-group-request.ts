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
 * @typedef BorrelkaartGroupRequest
 * @property {string} name.required - Name of the group
 * @property {string} activeStartDate.required - Date from which the included cards are active
 * @property {string} activeEndDate - Date from which cards are no longer active
 * @property {Array.<User>} borrelkaarten.required - Cards included in this group
 */
export default interface BorrelkaartGroupRequest {
  name: string,
  activeStartDate: string,
  activeEndDate: string,
  borrelkaarten: Array<User>,
}
