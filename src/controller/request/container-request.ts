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
 * This is the module page of the container-request.
 *
 * @module catalogue/containers
 */

/**
 * Base parameters shared between container create and update requests.
 */
export interface BaseContainerParams {
  products: number[],
  public: boolean,
  name: string,
}

/**
 * Parameters for creating a new `container`.
 */
export interface CreateContainerParams extends BaseContainerParams {
  ownerId: number,
}

/**
 * Parameters for updating an existing `container`.
 */
export interface UpdateContainerParams extends BaseContainerParams {
  id: number
}

/**
 * Union of create and update container params.
 */
export type ContainerParams = UpdateContainerParams | CreateContainerParams;

// These are definitions only used by the endpoints since we need the OwnerID
// But dont want to include them in the type as required but still need
// strict type checker later down the line.

/**
 * API Request for creating a `container` entity.
 * @typedef {object} CreateContainerRequest
 * @property {string} name.required - Name of the container
 * @property {Array<integer>} products.required -
 *    IDs or requests of the products to add to the container
 * @property {boolean} public.required - Whether the container is public or not
 * @property {integer} ownerId.required - Id of the organ that will own the container
 */
export interface CreateContainerRequest extends BaseContainerParams {
  ownerId: number,
}

/**
 * API Request for updating a `container` entity.
 * @typedef {object} UpdateContainerRequest
 * @property {string} name.required - Name of the container
 * @property {Array<integer>} products.required -
 *    IDs or requests of the products to add to the container
 * @property {boolean} public.required - Whether the container is public or not
 */
export type UpdateContainerRequest = BaseContainerParams;
