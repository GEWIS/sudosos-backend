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


import { UserResponse } from './user-response';
import { TermsOfServiceStatus } from '../../entity/user/user';
import RoleResponse from './rbac/role-response';

/**
 * @typedef {object} PermissionResponse
 * @param entity - The entity type name of the object. Most often this is a
 *    database entity, but it could also be a computed entity such as 'balance'.
 * @param action - The action on the entity to check access for.
 *    Commonly used actions are 'create', 'read', 'update', and 'delete'.
 * @param relationship - The ownership relation towards the object.
 *    The ownership relation describes the status of the user related to the object:
 *    the user can be the owner, creator, editor, or not related at all.
 *    Commonly used ownership relations are 'own', 'created' and 'all'.
 * @param attributes - The list of attributes to access. The wildcard '*' can be
 *    used to verify that the user is allowed to access all properties.
 */
export interface PermissionResponse {
  entity: string;
  action: string;
  relationship: string;
  attributes: string[];
}

/**
  * @typedef {object} AuthenticationResponse
  * @property {UserResponse} user.required - The user that has authenticated.
  * @property {Array<string>} roles.required - The RBAC roles that the user has. (DEPRECATED)
  * @property {Array<UserResponse>} organs.required - The organs that the user is a member of.
  * @property {string} token.required - The JWT token that can be used as Bearer token for authentication.
 *  @property {string} acceptedToS.required - Whether the related user has accepted the Terms of Service
 *  or is not required to.
 *  @property {Array<RoleWithPermissionsResponse>} rolesWithPermissions.required - All unique RBAC permissions the user has
  */
export default interface AuthenticationResponse {
  user: UserResponse,
  /**
   * @deprecated Use roles with permissions instead
   */
  roles: string[],
  organs: UserResponse[],
  token: string,
  acceptedToS: TermsOfServiceStatus;
  rolesWithPermissions: RoleResponse[],
}
