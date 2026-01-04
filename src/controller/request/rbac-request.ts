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
 * This is the module page of the rbac-request.
 *
 * @module rbac
 */

import Role from '../../entity/rbac/role';
import Permission from '../../entity/rbac/permission';

/**
 * @typedef {object} UpdateRoleRequest
 * @property {string} name.required - Name of the role
 */
export interface UpdateRoleRequest extends Pick<Role, 'name'> {}

/**
 * @typedef {object} CreatePermissionParams
 * @property {string} entity.required - Entity
 * @property {string} action.required - Action
 * @property {string} relation.required - Relation
 * @property {Array.<string>} attributes.required - Attributes
 */

/**
 * @typedef {Array.<CreatePermissionParams>} CreatePermissionsRequest
 */
export interface CreatePermissionParams extends Pick<Permission, 'entity' | 'action' | 'relation' | 'attributes'> {}
