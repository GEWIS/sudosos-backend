/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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

import BaseResponse from './base-response';
import { ContainerWithProductsResponse } from './container-response';
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import RoleResponse from './rbac/role-response';

/**
 * @typedef {allOf|BaseResponse} BasePointOfSaleResponse
 * @property {string} name.required - The name of the point-of-sale.
 */
export interface BasePointOfSaleResponse extends BaseResponse {
  name: string,
}
/**
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
 * @typedef {object} PaginatedPointOfSaleResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<PointOfSaleResponse>} records.required - Returned points of sale
 */
export interface PaginatedPointOfSaleResponse {
  _pagination: PaginationResult,
  records: (PointOfSaleResponse | PointOfSaleWithContainersResponse)[],
}

/**
 * @typedef {allOf|PointOfSaleResponse} PointOfSaleWithContainersResponse
 * @property {Array<ContainerWithProductsResponse>} containers.required - The containers
 * in the point-of-sale.
 */
export interface PointOfSaleWithContainersResponse extends PointOfSaleResponse {
  containers: ContainerWithProductsResponse[],
}

/**
 * @typedef {object} PointOfSaleAssociateUsersResponse
 * @property {BaseUserResponse} owner.required - Owner of the POS
 * @property {Array.<BaseUserResponse>} ownerMembers.required - Members that belong to the owner
 * @property {Array.<BaseUserResponse>} cashiers.required - Users that belong to at least one
 * cashier role of this point of sale
 */
export interface PointOfSaleAssociateUsersResponse {
  owner: BaseUserResponse,
  ownerMembers: BaseUserResponse[],
  cashiers: BaseUserResponse[],
}
