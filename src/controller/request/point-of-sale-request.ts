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

export interface BasePointOfSaleParams {
  containers: number[],
  name: string,
  useAuthentication: boolean;
}

export interface CreatePointOfSaleParams extends BasePointOfSaleParams {
  ownerId: number,
}

export interface UpdatePointOfSaleParams extends BasePointOfSaleParams {
  id: number
}

/**
 * @typedef {object} CreatePointOfSaleRequest
 * @property {string} name.required - Name of the POS
 * @property {boolean} useAuthentication.required - Whether this POS requires users to
 * authenticate themselves before making a transaction
 * @property {Array<integer>} containers -
 * IDs or Requests of the containers to add to the POS
 * @property {integer} ownerId - ID of the user who will own the POS, if undefined it will
 *    default to the token ID.
 */
export interface CreatePointOfSaleRequest extends BasePointOfSaleParams {
  ownerId?: number,
}

/**
 * @typedef {object} UpdatePointOfSaleRequest
 * @property {string} name.required - Name of the POS
 * @property {boolean} useAuthentication.required - Whether this POS requires users to
 * authenticate themselves before making a transaction
 * @property {Array<integer>} containers -
 * IDs or Requests of the containers to add to the POS
 * @property {integer} id.required - ID of the POS to update.
 */
export type UpdatePointOfSaleRequest = BasePointOfSaleParams & { id: number };
