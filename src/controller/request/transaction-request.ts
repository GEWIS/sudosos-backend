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
 * This is the module page of the transaction-request.
 *
 * @module transactions
 */

/**
 * This is the module page of the transaction-request.
 *
 * @module transactions
 */

import { DineroObjectRequest } from './dinero-request';
import RevisionRequest from './revision-request';

/**
 * @typedef {object} TransactionRequest
 * @property {integer} from.required - from user id
 * @property {integer} createdBy - createdBy user id
 * @property {Array<SubTransactionRequest>} subTransactions.required - subtransactions
 * @property {RevisionRequest} pointOfSale.required - point of sale
 * @property {DineroObjectRequest} totalPriceInclVat.required - total price of the transaction
 */
export interface TransactionRequest {
  from: number,
  createdBy: number,
  subTransactions: SubTransactionRequest[],
  pointOfSale: RevisionRequest,
  totalPriceInclVat: DineroObjectRequest,
}

/**
 * @typedef {object} SubTransactionRequest
 * @property {integer} to.required - to user id
 * @property {RevisionRequest} container.required - container
 * @property {Array<SubTransactionRowRequest>} subTransactionRows.required - subtransaction rows
 * @property {DineroObjectRequest} totalPriceInclVat.required - total price
 *           of the subtransaction
 */
export interface SubTransactionRequest {
  to: number,
  container: RevisionRequest,
  subTransactionRows: SubTransactionRowRequest[],
  totalPriceInclVat: DineroObjectRequest,
}

/**
 * @typedef {object} SubTransactionRowRequest
 * @property {RevisionRequest} product - product
 * @property {integer} amount - amount of this product in subtransaction
 * @property {DineroObjectRequest} totalPriceInclVat.required - total price
 *           of the subtransaction row
 */
export interface SubTransactionRowRequest {
  product: RevisionRequest,
  amount: number,
  totalPriceInclVat: DineroObjectRequest,
}
