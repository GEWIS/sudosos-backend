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

export interface BaseContainerParams {
  products: number[],
  public: boolean,
  name: string,
}

export interface CreateContainerParams extends BaseContainerParams {
  ownerId: number,
}

export interface UpdateContainerParams extends BaseContainerParams {
  id: number
}

export type ContainerParams = UpdateContainerParams | CreateContainerParams;

// These are definitions only used by the endpoints since we need the OwnerID
// But dont want to include them in the type as required but still need
// strict type checker later down the line.

/**
 * @typedef CreateContainerRequest
 * @property {string} name.required - Name of the container
 * @property {Array.<integer>} products.required -
 *    IDs or requests of the products to add to the container
 * @property {boolean} public.required - Whether the container is public or not
 * @property {integer} ownerId - Id of the user who will own the container, if undefined it will
 *    default to the token ID.
 */
export interface CreateContainerRequest extends BaseContainerParams {
  ownerId?: number,
}

/**
 * @typedef UpdateContainerRequest
 * @property {string} name.required - Name of the container
 * @property {Array.<integer>} products.required -
 *    IDs or requests of the products to add to the container
 * @property {boolean} public.required - Whether the container is public or not
 */
export type UpdateContainerRequest = BaseContainerParams;
