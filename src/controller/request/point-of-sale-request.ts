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
import { ContainerParams } from './container-request';

export interface BasePointOfSaleParams {
  containers?: (number | ContainerParams)[],
  useAuthentication?: boolean,
  name: string,
  startDate: string,
  endDate?: string,
}

export interface CreatePointOfSaleParams extends BasePointOfSaleParams{
  ownerId: number,
}

export interface UpdatePointOfSaleParams extends CreatePointOfSaleParams {
  id: number
}

/**
 * @typedef CreatePointOfSaleRequest
 * @property {string} name.required - Name of the POS
 * @property {string} startDate.required - Date from which the POS is active
 * @property {string} endDate - Date from which the POS is no longer active
 * @property {Array.<number | ContainerParams>} containers -
 * IDs or Requests of the containers to add to the POS
 * @property {boolean} useAuthentication - Whether the POS requires authentication or not.
 * @property {integer} ownerId - ID of the user who will own the POS, if undefined it will
 *    default to the token ID.
 */
export interface CreatePointOfSaleRequest extends BasePointOfSaleParams{
  ownerId?: number,
}

/**
 * @typedef UpdatePointOfSaleRequest
 * @property {string} name.required - Name of the POS
 * @property {string} startDate.required - Date from which the POS is active
 * @property {string} endDate - Date from which the POS is no longer active
 * @property {Array.<number | ContainerParams>} containers -
 * IDs or Requests of the containers to add to the POS
 * @property {boolean} useAuthentication - Whether the POS requires authentication or not.
 * @property {integer} id.required - ID of the POS to update.
 */
export type UpdatePointOfSaleRequest = BasePointOfSaleParams;
