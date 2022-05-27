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
import BaseResponse from './base-response';
import { ContainerWithProductsResponse } from './container-response';
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {BaseResponse} BasePointOfSaleResponse
 * @property {string} name.required - The name of the point-of-sale.
 */
export interface BasePointOfSaleResponse extends BaseResponse {
  name: string,
}
/**
 * @typedef {BasePointOfSaleResponse} PointOfSaleResponse
 * @property {BaseUserResponse.model} owner - The owner of the point-of-sale.
 * @property {number} revision.required - Revision of the POS
 */
export interface PointOfSaleResponse extends BasePointOfSaleResponse {
  owner?: BaseUserResponse,
  revision: number,
}

/**
 * @typedef PaginatedPointOfSaleResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<PointOfSaleResponse.model>} records - Returned points of sale
 */
export interface PaginatedPointOfSaleResponse {
  _pagination: PaginationResult,
  records: (PointOfSaleResponse | PointOfSaleWithContainersResponse)[],
}

/**
 * @typedef {BasePointOfSaleResponse} UpdatedPointOfSaleResponse
 * @property {BaseUserResponse.model} owner.required - The owner of the point-of-sale.
 */
export interface UpdatedPointOfSaleResponse extends BasePointOfSaleResponse {
  owner?: BaseUserResponse,
}

type UpdatedPOSResponses = UpdatedPointOfSaleResponse | UpdatedPointOfSaleWithContainersResponse;

/**
 * @typedef PaginatedUpdatedPointOfSaleResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<UpdatedPOSResponses.model>}
 * records - Returned points of sale
 */
export interface PaginatedUpdatedPointOfSaleResponse {
  _pagination: PaginationResult,
  records: (UpdatedPOSResponses)[],
}

/**
 * @typedef {PointOfSaleResponse} PointOfSaleWithContainersResponse
 * @property {Array<ContainerWithProductsResponse.model>} containers.required - The containers
 * in the point-of-sale.
 */
export interface PointOfSaleWithContainersResponse extends PointOfSaleResponse {
  containers: ContainerWithProductsResponse[],
}

/**
 * @typedef {UpdatedPointOfSaleResponse} UpdatedPointOfSaleWithContainersResponse
 * @property {Array<ContainerWithProductsResponse.model>} containers.required - The containers
 * in the point-of-sale.
 */
export interface UpdatedPointOfSaleWithContainersResponse extends UpdatedPointOfSaleResponse {
  containers: ContainerWithProductsResponse[],
}
