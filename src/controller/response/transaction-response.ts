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

import { DineroObject } from 'dinero.js';
import BaseResponse from './base-response';
import { BasePointOfSaleResponse, PointOfSaleResponse } from './point-of-sale-response';
import { BaseContainerResponse } from './container-response';
import { BaseProductResponse } from './product-response';
import { BaseUserResponse } from './user-response';
import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} BaseTransactionResponse
 * @property {BaseUserResponse} from.required - The account from which the transaction
 * is subtracted.
 * @property {BaseUserResponse} createdBy - The user that created the transaction, if not
 * same as 'from'..
 * @property {BasePointOfSaleResponse} pointOfSale.required - The POS at which this transaction
 * has been created
 * @property {Dinero} value.required - Total sum of subtransactions
 */
export interface BaseTransactionResponse extends BaseResponse {
  from: BaseUserResponse,
  createdBy?: BaseUserResponse,
  pointOfSale: BasePointOfSaleResponse,
  value: DineroObject,
}

/**
 * @typedef {allOf|BaseResponse} TransactionResponse
 * @property {BaseUserResponse} from.required - The account from which the transaction
 * is subtracted.
 * @property {BaseUserResponse} createdBy - The user that created the transaction, if not
 * same as 'from'.
 * @property {Array<SubTransactionResponse>} subTransactions.required - The subtransactions
 * belonging to this transaction.
 * @property {PointOfSaleResponse} pointOfSale.required - The POS at which this transaction
 * has been created
 * @property {DineroObjectResponse} totalPriceInclVat.required - The total cost of the
 * transaction
 */
export interface TransactionResponse extends BaseResponse {
  from: BaseUserResponse,
  createdBy?: BaseUserResponse,
  subTransactions: SubTransactionResponse[],
  pointOfSale: PointOfSaleResponse,
  totalPriceInclVat: DineroObjectResponse,
}

/**
 * @typedef {allOf|BaseResponse} SubTransactionResponse
 * @property {BaseUserResponse} to.required - The account that the transaction is added to.
 * @property {BaseContainerResponse} container.required - The container from which all
 * products in the SubTransactionRows are bought
 * @property {Array<SubTransactionRowResponse>} subTransactionRows.required - The rows of this
 *     SubTransaction
 * @property {DineroObjectResponse} totalPriceInclVat.required - The total cost of the sub
 *     transaction
 */
export interface SubTransactionResponse extends BaseResponse {
  to: BaseUserResponse,
  container: BaseContainerResponse,
  subTransactionRows: SubTransactionRowResponse[],
  totalPriceInclVat: DineroObjectResponse,
}

/**
 * @typedef {allOf|BaseResponse} SubTransactionRowResponse
 * @property {BaseProductResponse} product.required - The product that has been bought
 * @property {number} amount.required - The amount that has been bought
 * @property {DineroObjectResponse} totalPriceInclVat.required - The cost of the
 *     sub transaction row
 */
export interface SubTransactionRowResponse extends BaseResponse {
  product: BaseProductResponse,
  amount: number,
  totalPriceInclVat: DineroObjectResponse,
}

/**
 * @typedef {object} PaginatedBaseTransactionResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<BaseTransactionResponse>} records.required - Returned banners
 */
export interface PaginatedBaseTransactionResponse {
  _pagination: PaginationResult,
  records: BaseTransactionResponse[],
}
