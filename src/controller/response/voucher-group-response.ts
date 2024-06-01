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
 */

import BaseResponse from './base-response';
import { UserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import { DineroObjectResponse } from './dinero-response';

/**
  * @typedef {allOf|BaseResponse} VoucherGroupResponse
  * @property {string} name.required - Name of the voucher group
  * @property {string} activeStartDate - Start date of the voucher group
  * @property {string} activeEndDate.required - End date of the voucher group
  * @property {Array<UserResponse>} users.required - Users in the voucher group
  * @property {DineroObjectRequest} balance.required - Start balance to be assigned
  *  to the voucher users
  * @property {number} amount.required - Amount of users to be assigned to the voucher group
  */
export default interface VoucherGroupResponse extends BaseResponse {
  name: string,
  activeStartDate?: string,
  activeEndDate: string,
  amount: number,
  balance: DineroObjectResponse,
  users: UserResponse[],
}

/**
 * @typedef {object} PaginatedVoucherGroupResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<VoucherGroupResponse>} records.required - Returned voucher groups
 */
export interface PaginatedVoucherGroupResponse {
  _pagination: PaginationResult,
  records: VoucherGroupResponse[],
}
