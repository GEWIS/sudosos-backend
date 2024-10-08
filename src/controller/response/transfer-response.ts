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

/**
 * This is the module page of the transfer-response.
 *
 * @module transfers
 */

import BaseResponse from './base-response';
import { DineroObjectResponse } from './dinero-response';
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import { BaseInvoiceResponse } from './invoice-response';
import { StripeDepositResponse } from './stripe-response';
import { BasePayoutRequestResponse } from './payout-request-response';
import { FineResponse, UserFineGroupResponse } from './debtor-response';
import { BaseVatGroupResponse } from './vat-group-response';
import { BaseWriteOffResponse } from './write-off-response';

/**
 * @typedef {allOf|BaseResponse} TransferResponse
 * @property {string} description.required - Description of the transfer
 * @property {Dinero} amountInclVat.required - Amount of money being transferred
 * @property {Dinero} amount.required - (@deprecated) Amount of money being transferred
 * @property {BaseUserResponse} from - from which user the money is being transferred
 * @property {BaseUserResponse} to - to which user the money is being transferred.
 * @property {BaseInvoiceResponse} invoice - invoice belonging to this transfer
 * @property {StripeDepositResponse} deposit - deposit belonging to this transfer
 * @property {BasePayoutRequestResponse} payoutRequest - payout request belonging to this transfer
 * @property {FineResponse} fine - fine belonging to this transfer
 * @property {VatGroupResponse} vat - vat group belonging to this transfer
 * @property {BaseWriteOffResponse} writeOff - write-off belonging to this transfer
 * @property {UserFineGroupResponse} waivedFines - fines that have been waived by this transfer
 */
export interface TransferResponse extends BaseResponse {
  amountInclVat: DineroObjectResponse;
  /**
   * @deprecated
   */
  amount: DineroObjectResponse;
  description: string;
  from: BaseUserResponse;
  to: BaseUserResponse;
  invoice?: BaseInvoiceResponse;
  deposit?: StripeDepositResponse;
  payoutRequest?: BasePayoutRequestResponse;
  fine?: FineResponse;
  vat?: BaseVatGroupResponse;
  writeOff?: BaseWriteOffResponse;
  waivedFines?: UserFineGroupResponse;
}

/**
 * @typedef {object} PaginatedTransferResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<TransferResponse>} records.required - Returned transfers
 */
export interface PaginatedTransferResponse {
  _pagination: PaginationResult,
  records: TransferResponse[],
}
