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


import EntityResponse from './entity-response';

/**
 * @typedef {object} RoleResponse
 * @property {string} role.required - The name of the role.
 */

/**
 * @typedef {RoleResponse} RoleWithPermissionsResponse
 * @property {Array<EntityResponse>} entities.required - The permissions with regards to the entity.
 */
export default interface RoleResponse {
  role: string;
  entities: EntityResponse[];
}
