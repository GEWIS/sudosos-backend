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
 * This is the module page of the relation-response.
 *
 * @module rbac
 */

import { AllowedAttribute } from '../../../rbac/role-definitions';

/**
 * @typedef {object} RelationResponse -
 * The relation response contains the name of the ownership relation towards the entity,
 * and the list of attributes for which the role gives access.
 * Typical ownership relations are 'own', 'created', and 'all'.
 * @property {string} relation.required - The the ownership relation towards the entity.
 * @property {Array<string>} attributes.required - The attributes of the entity for which there is access.
 */
export default interface RelationResponse {
  relation: string;
  attributes: AllowedAttribute[];
}
