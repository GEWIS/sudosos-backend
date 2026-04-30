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
 * This is the module page of the point-of-sale-response.
 *
 * @module catalogue/point-of-sale
 */

import BaseResponse from './base-response';
import { ContainerWithProductsResponse } from './container-response';
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import RoleResponse from './rbac/role-response';

/**
 * Minimal API Response for the `point of sale` entity, carrying only the id and revision.
 * @typedef {allOf|BaseResponse} BasePointOfSaleInfoResponse
 * @property {number} revision.required - Revision of the POS
 */
export interface BasePointOfSaleInfoResponse extends BaseResponse {
  revision: number,
}

/**
 * Base API Response for the `point of sale` entity.
 * @typedef {allOf|BaseResponse} BasePointOfSaleResponse
 * @property {string} name.required - The name of the point-of-sale.
 * @property {number} revision.required - Revision of the POS
 * @property {boolean} useAuthentication.required - Whether this POS requires users to
 * authenticate themselves before making a transaction
 */
export interface BasePointOfSaleResponse extends BaseResponse {
  name: string,
  revision: number,
  useAuthentication: boolean,
}
/**
 * API Response for the `point of sale` entity.
 * @typedef {allOf|BasePointOfSaleResponse} PointOfSaleResponse
 * @property {BaseUserResponse} owner - The owner of the point-of-sale.
 * @property {number} revision.required - Revision of the POS
 * @property {boolean} useAuthentication.required - Whether this POS requires users to
 * authenticate themselves before making a transaction
 * @property {Array.<RoleResponse>} cashierRoles.required - The roles that are
 * cashiers of this POS
 */
export interface PointOfSaleResponse extends BasePointOfSaleResponse {
  owner: BaseUserResponse,
  revision: number,
  useAuthentication: boolean;
  cashierRoles: RoleResponse[]
}

/**
 * Paginated API Response for the `point of sale` entity.
 * @typedef {object} PaginatedPointOfSaleResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<PointOfSaleResponse>} records.required - Returned points of sale
 */
export interface PaginatedPointOfSaleResponse {
  _pagination: PaginationResult,
  records: (PointOfSaleResponse | PointOfSaleWithContainersResponse)[],
}

/**
 * API Response for the `point of sale` entity, including its containers and their products.
 * @typedef {allOf|PointOfSaleResponse} PointOfSaleWithContainersResponse
 * @property {Array<ContainerWithProductsResponse>} containers.required - The containers
 * in the point-of-sale.
 */
export interface PointOfSaleWithContainersResponse extends PointOfSaleResponse {
  containers: ContainerWithProductsResponse[],
}

/**
 * A `BaseUserResponse` augmented with a stable position index, used to keep ordered user lists
 * (e.g. POS owner members) rendering in a consistent order across requests.
 * @typedef {object} UserWithIndex
 * @property {number} index.required - Stable position index for sorting
 */
export interface UserWithIndex extends BaseUserResponse {
  index: number;
}

/**
 * API Response describing who is associated with a `point of sale`: its owner, the owner's
 * organ members, and the cashier users (users holding at least one of the POS's cashier roles).
 * @typedef {object} PointOfSaleAssociateUsersResponse
 * @property {BaseUserResponse} owner.required - Owner of the POS
 * @property {Array.<UserWithIndex>} ownerMembers.required - Members that belong to the owner with stable indices
 * @property {Array.<BaseUserResponse>} cashiers.required - Users that belong to at least one
 * cashier role of this point of sale
 */
export interface PointOfSaleAssociateUsersResponse {
  owner: BaseUserResponse,
  ownerMembers: UserWithIndex[],
  cashiers: BaseUserResponse[],
}
