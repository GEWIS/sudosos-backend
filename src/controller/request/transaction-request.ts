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

import RevisionRequest from './revision-request';

/**
 * @typedef TransactionRequest
 * @property {integer} from.required - from user id
 * @property {integer} createdBy - createdBy user id
 * @property {Array.<SubtransactionRequest>} subtransactions.required - subtransactions
 * @property {RevisionRequest.model} pointOfSale.required - point of sale
 */
export interface TransactionRequest {
  from: number,
  createdBy: number,
  subtransactions: SubTransactionRequest[],
  pointOfSale: RevisionRequest,
}

/**
 * @typedef SubTransactionRequest
 * @property {integer} to.required - to user id
 * @property {RevisionRequest.model} container.required - container
 * @property {Array.<SubTransactionRowRequest>} subTransactionRows.required - subtransaction rows
 */
export interface SubTransactionRequest {
  to: number,
  container: RevisionRequest,
  subTransactionRows: SubTransactionRowRequest[],
}

/**
 * @typedef SubTransactionRowRequest
 * @property {RevisionRequest.model} product - product
 * @property {integer} amount - amount of this product in transaction
 */
export interface SubTransactionRowRequest {
  product: RevisionRequest,
  amount: number,
}
