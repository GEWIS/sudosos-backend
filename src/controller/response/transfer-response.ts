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
import { BaseInactiveAdministrativeCostResponse } from './inactive-administrative-cost-response';
import { SellerPayoutResponse } from './seller-payout-response';

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
 * @property {BaseInactiveAdministrativeCostResponse} inactiveAdministrativeCost - inactive administrative cost that belongs to this transfer
 * @property {SellerPayoutResponse} sellerPayout - seller payout belonging to this transfer
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
  inactiveAdministrativeCost?: BaseInactiveAdministrativeCostResponse;
  sellerPayout?: SellerPayoutResponse;
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

/**
 * @typedef {object} TransferAggregateResponse
 * @property {DineroObjectResponse} total.required - The sum of the amountInclVat of all matching transfers
 * @property {integer} count.required - The number of matching transfers
 */
export interface TransferAggregateResponse {
  total: DineroObjectResponse;
  count: number;
}

/**
 * @typedef {object} TransferSummaryResponse
 * @property {TransferAggregateResponse} total.required - Aggregate over all transfers
 * @property {TransferAggregateResponse} deposits.required - Aggregate over deposit transfers
 * @property {TransferAggregateResponse} payoutRequests.required - Aggregate over payout-request transfers
 * @property {TransferAggregateResponse} sellerPayouts.required - Aggregate over seller-payout transfers
 * @property {TransferAggregateResponse} invoices.required - Aggregate over invoice transfers (excluding credited/deleted invoices)
 * @property {TransferAggregateResponse} creditInvoices.required - Aggregate over credit-invoice (reversal) transfers
 * @property {TransferAggregateResponse} fines.required - Aggregate over fine transfers
 * @property {TransferAggregateResponse} waivedFines.required - Aggregate over waived-fines transfers
 * @property {TransferAggregateResponse} writeOffs.required - Aggregate over write-off transfers
 * @property {TransferAggregateResponse} inactiveAdministrativeCosts.required - Aggregate over inactive-administrative-cost transfers
 * @property {TransferAggregateResponse} manualCreations.required - Aggregate over orphaned transfers where fromId is null (money entering the system without a linked entity)
 * @property {TransferAggregateResponse} manualDeletions.required - Aggregate over orphaned transfers where toId is null (money leaving the system without a linked entity)
 */
export interface TransferSummaryResponse {
  total: TransferAggregateResponse;
  deposits: TransferAggregateResponse;
  payoutRequests: TransferAggregateResponse;
  sellerPayouts: TransferAggregateResponse;
  invoices: TransferAggregateResponse;
  creditInvoices: TransferAggregateResponse;
  fines: TransferAggregateResponse;
  waivedFines: TransferAggregateResponse;
  writeOffs: TransferAggregateResponse;
  inactiveAdministrativeCosts: TransferAggregateResponse;
  manualCreations: TransferAggregateResponse;
  manualDeletions: TransferAggregateResponse;
}
