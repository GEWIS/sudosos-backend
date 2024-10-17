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
 * This is the module page of the role-response.
 *
 * @module rbac
 */

import PermissionResponse from './permission-response';

/**
 * @typedef {object} RoleResponse
 * @property {integer} id.required - The ID of the role.
 * @property {string} name.required - The name of the role.
 * @property {boolean} systemDefault.required - Whether the role is a system default role
 * @property {Array.<string>} userTypes - The user types this role is default for
 */

/**
 * @typedef {allOf|RoleResponse} RoleWithPermissionsResponse
 * @property {Array.<PermissionResponse>} permissions.required - The permissions with regards to the entity.
 */
export default interface RoleResponse {
  id: number;
  name: string;
  systemDefault: boolean;
  userTypes?: string[];
  permissions?: PermissionResponse[];
}
