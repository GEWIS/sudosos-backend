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
import { DineroObjectResponse } from './dinero-response';
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import { BaseInvoiceResponse } from './invoice-response';
import { StripeDepositResponse } from './stripe-response';
import { BasePayoutRequestResponse } from './payout-request-response';

/**
 * @typedef {BaseResponse} TransferResponse
 * @property {string} description.required - Description of the transfer
 * @property {Dinero.model} amount.required - Amount of money being transferred
 * @property {BaseUserResponse.model} from - from which user the money is being transferred
 * @property {BaseUserResponse.model} to - to which user the money is being transferred.
 * @property {BaseInvoiceResponse.model} invoice - invoice belonging to this transfer
 * @property {StripeDepositResponse.model} deposit - deposit belonging to this transfer
 * @property {BasePayoutRequestResponse.model} payoutRequest - payout request belonging to this transfer
 */
export interface TransferResponse extends BaseResponse {
  amount: DineroObjectResponse;
  description: string;
  from: BaseUserResponse;
  to: BaseUserResponse;
  invoice?: BaseInvoiceResponse;
  deposit?: StripeDepositResponse;
  payoutRequest?: BasePayoutRequestResponse;
}

/**
 * @typedef PaginatedTransferResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array.<TransferResponse>} records - Returned transfers
 */
export interface PaginatedTransferResponse {
  _pagination: PaginationResult,
  records: TransferResponse[],
}
