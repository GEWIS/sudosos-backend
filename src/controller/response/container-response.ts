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
import { ProductResponse } from './product-response';
import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} BaseContainerResponse
 * @property {string} name.required - The name of the container.
 * @property {boolean} public.required - Public status of the container.
 * @property {integer} revision - The container revision.
 */
export interface BaseContainerResponse extends BaseResponse {
  name: string,
  public: boolean,
  revision?: number,
}

/**
 * @typedef {allOf|BaseContainerResponse} ContainerResponse
 * @property {BaseUserResponse} owner.required - The owner of the container.
 */
export interface ContainerResponse extends BaseContainerResponse {
  owner: BaseUserResponse,
}

/**
 * @typedef {object} PaginatedContainerResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<ContainerResponse>} records.required - Returned containers
 */
export interface PaginatedContainerResponse {
  _pagination: PaginationResult,
  records: ContainerResponse[],
}

/**
 * @typedef {object} PaginatedContainerWithProductResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<ContainerWithProductsResponse>} records.required - Returned containers
 */
export interface PaginatedContainerWithProductResponse {
  _pagination: PaginationResult,
  records: ContainerWithProductsResponse[],
}

/**
 * @typedef {allOf|ContainerResponse} ContainerWithProductsResponse
 * @property {Array<ProductResponse>} products.required - The products in the container.
 */
export interface ContainerWithProductsResponse extends ContainerResponse {
  products: ProductResponse[],
}
