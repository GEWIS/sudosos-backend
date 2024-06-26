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
import { BaseUserResponse } from './user-response';
import { DineroObjectResponse } from './dinero-response';
import { PayoutRequestState } from '../../entity/transactions/payout-request-status';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} BoilerPayoutRequestResponse
 * @property {BaseUserResponse} requestedBy.required - The user that requested a payout
 * @property {BaseUserResponse} approvedBy - The user that potentially approved the payout request
 * @property {DineroObjectResponse} amount.required - The amount requested to be paid out
 */
interface BoilerPayoutRequestResponse extends BaseResponse {
  requestedBy: BaseUserResponse,
  approvedBy?: BaseUserResponse,
  amount: DineroObjectResponse,
}

/**
 * @typedef {allOf|BoilerPayoutRequestResponse} BasePayoutRequestResponse
 * @property {string} status - The current status of the payout request
 */
export interface BasePayoutRequestResponse extends BoilerPayoutRequestResponse {
  status?: PayoutRequestState,
}

/**
 * @typedef {allOf|BaseResponse} PayoutRequestStatusResponse
 * @property {string} state.required - The state of this status change
 */
export interface PayoutRequestStatusResponse extends BaseResponse {
  state: PayoutRequestState
}

/**
 * @typedef {allOf|BoilerPayoutRequestResponse} PayoutRequestResponse
 * @property {Array<PayoutRequestStatusResponse>} status.required - Statuses of this
 * payout response over time
 * @property {string} bankAccountNumber.required - Bank account number
 * @property {string} bankAccountName.required - Name of the account owner
 */
export interface PayoutRequestResponse extends BoilerPayoutRequestResponse {
  status: PayoutRequestStatusResponse[],
  bankAccountNumber: string,
  bankAccountName: string,
}

/**
 * @typedef {object} PaginatedBasePayoutRequestResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<BasePayoutRequestResponse>} records.required - Returned payout requests
 */
export interface PaginatedBasePayoutRequestResponse {
  _pagination: PaginationResult,
  records: BasePayoutRequestResponse[],
}
