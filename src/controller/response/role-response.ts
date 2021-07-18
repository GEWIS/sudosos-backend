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

export type AllowedAttribute = string;

/**
 * @typedef RelationResponse -
 * The relation response contains the name of the ownership relation towards the entity,
 * and the list of attributes for which the role gives access.
 * @property {string} relation - The the ownership relation towards the entity.
 * @property {Array<string>} attributes - The attributes of the entity for which there is access.
 */
export interface RelationResponse {
  relation: string;
  attributes: AllowedAttribute[];
}

/**
 * @typedef ActionResponse -
 * The action conains the name of the action and a list of permissions per action.
 * Typically the action name is one of the CRUD values 'create', 'read', 'update', and 'delete'.
 * @property {string} action - The name of the action performed on the entity.
 * @property {Array<RelationResponse>} relations - The list of ownership relations with permissions.
 */
export interface ActionResponse {
  action: string;
  relations: RelationResponse[];
}

/**
 * @typedef EntityResponse -
 * The entity contains a name and a list of permissions per action.
 * @property {string} entity - The name of the entity for which the permissions are.
 * @property {Array<ActionResponse>} actions - The permissions per action.
 */
export interface EntityResponse {
  entity: string;
  actions: ActionResponse[];
}

/**
 * @typedef RoleResponse -
 * A role contains a unique name, and a list of permissions per entity.
 * @property {string} role.required - The name of the role.
 * @property {Array<EntityResponse>} entities - The permissions with regards to the entity.
 */
export interface RoleResponse {
  role: string;
  entities: EntityResponse[];
}
