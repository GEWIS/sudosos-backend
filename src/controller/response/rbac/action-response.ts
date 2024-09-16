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

import RelationResponse from './relation-response';

/**
 * @typedef {object} ActionResponse -
 * The action contains the name of the action and a list of permissions per action.
 * Typically the action name is one of the CRUD values 'create', 'read', 'update', and 'delete'.
 * @property {string} action.required - The name of the action performed on the entity.
 * @property {Array<RelationResponse>} relations.required - The ownership relations with permissions.
 */
export default interface ActionResponse {
  action: string;
  relations: RelationResponse[];
}
