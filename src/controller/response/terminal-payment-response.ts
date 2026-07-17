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
 * This is the module page of the terminal payment response.
 *
 * @module stripe/terminal-payment
 */

import { TerminalPaymentState } from '../../entity/transactions/terminal/terminal-payment';
import BaseResponse from './base-response';
import { DineroObjectResponse } from './dinero-response';
import { TransactionResponse } from './transaction-response';
import { TransferResponse } from './transfer-response';
import { BaseUserResponse } from './user-response';

/**
 * @typedef {allOf|BaseResponse} TerminalPaymentResponse
 * @property {TransactionResponse} transaction - The created
 * transaction when the payment is done. Undefined if cancelled.
 * @property {TransferResponse} transfer - The transfer belonging to this
 * terminal payment. Undefined if not paid yet.
 * @property {BaseUserResponse} createdBy.required - The user who created this
 * terminal payment.
 * @property {string} state.required - The state of the terminal
 * payment. One of 'created', 'processing', 'paid' or 'cancelled'.
 * @property {DineroObjectResponse} amount.required - The total amount to be
 * paid
 */
export interface TerminalPaymentResponse extends BaseResponse {
  transaction?: TransactionResponse;
  transfer?: TransferResponse;
  createdBy: BaseUserResponse;
  state: TerminalPaymentState;
  amount: DineroObjectResponse
}
