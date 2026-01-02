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
 * @hidden
 * @module
 */

/**
 * @typedef {object} BaseResponse
 * @property {integer} id.required - The unique id of the entity.
 * @property {string} createdAt - The creation Date of the entity.
 * @property {string} updatedAt - The last update Date of the entity.
 * @property {integer} version - The version of the entity.
 */
export default interface BaseResponse {
  id: number,
  createdAt?: string,
  updatedAt?: string,
  version?: number,
}
