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

import { ProductRequestID } from './product-request';

/**
 * @typedef ContainerRequest
 * @property {string} name - Name of the container
 * @property {Array.<integer | ProductRequestID>} products - IDs or requests of the products to add to the container
 * @property {boolean} public - Whether the container is public or not
 */
export default interface ContainerRequest {
  name: string,
  products?: (number | ProductRequestID)[],
  public: boolean,
}

/**
 * @typedef ContainerRequestID
 * @property {integer} id - The id of the container to update.
 */
export interface ContainerRequestID extends ContainerRequest{
  id: number
}
