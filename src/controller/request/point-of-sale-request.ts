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
import { ContainerRequest } from './container-request';
import DurationRequest from './duration-request';
import NamedRequest from './named-request';

/**
 * @typedef BasePointOfSaleRequest
 * @property {string} name.required - Name of the POS
 * @property {string} startDate.required - Date from which the POS is active
 * @property {string} endDate - Date from which the POS is no longer active
 * @property {Array.<number | ContainerRequest>} containers -
 * IDs or Requests of the containers to add to the POS
 * @property {boolean} useAuthentication - Whether the POS requires authentication or not.
 */
export interface BasePointOfSaleRequest extends DurationRequest, NamedRequest {
  containers?: (number | ContainerRequest)[],
  useAuthentication?: boolean,
}

/**
 * @typedef {BasePointOfSaleRequest} CreatePointOfSaleRequestID
 * @property {integer} ownerId - ID of the owner
 */
export interface CreatePointOfSaleRequest extends BasePointOfSaleRequest{
  ownerId: number,
}

/**
 * @typedef {CreatePointOfSaleRequest} UpdatePointOfSaleRequest
 * @property {integer} id.required - ID of the POS to update.
 */
export interface UpdatePointOfSaleRequest extends CreatePointOfSaleRequest {
  id: number
}
