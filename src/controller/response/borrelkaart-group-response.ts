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
import { UserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import { DineroObjectResponse } from './dinero-response';

/**
  * @typedef {BaseResponse} BorrelkaartGroupResponse
  * @property {string} name.required - Name of the borrelkaart group
  * @property {string} activeStartDate - Start date of the borrelkaart group
  * @property {string} activeEndDate.required - End date of the borrelkaart group
  * @property {Array.<UserResponse>} users.required - Users in the borrelkaart group
  * @property {DineroObjectRequest.model} balance.required - Start balance to be assigned
  *  to the borrelkaart users
  * @property {number} amount.required - Amount of users to be assigned to the borrelkaart group
  */
export default interface BorrelkaartGroupResponse extends BaseResponse {
  name: string,
  activeStartDate?: string,
  activeEndDate: string,
  amount: number,
  balance: DineroObjectResponse,
  users: UserResponse[],
}

/**
 * @typedef PaginatedBorrelkaartGroupResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array.<BorrelkaartGroupResponse>} records - Returned borrelkaart groups
 */
export interface PaginatedBorrelkaartGroupResponse {
  _pagination: PaginationResult,
  records: BorrelkaartGroupResponse[],
}
