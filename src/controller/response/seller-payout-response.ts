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
import { BaseUserResponse } from './user-response';
import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} SellerPayoutResponse
 * @property {BaseUserResponse} requestedBy.required - The corresponding user
 * @property {DineroObjectResponse} amount.required - The value of the payout
 * @property {string} startDate.required - The lower bound of the time range used for this seller payout (inclusive)
 * @property {string} endDate.required - The upper bound of the time range used for this seller payout (exclusive)
 * @property {string} reference.required - Reference of the payout
 */
export interface SellerPayoutResponse extends BaseResponse {
  requestedBy: BaseUserResponse;
  amount: DineroObjectResponse;
  startDate: string;
  endDate: string;
  reference: string;
}

/**
 * @typedef {object} PaginatedSellerPayoutResponse
 * @property {PaginationResult} _pagination.required
 * @property {Array<SellerPayoutResponse>} records.required
 */
export interface PaginatedSellerPayoutResponse {
  _pagination: PaginationResult,
  records: SellerPayoutResponse[],
}
