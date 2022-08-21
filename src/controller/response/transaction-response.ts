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
import { DineroObject } from 'dinero.js';
import BaseResponse from './base-response';
import { BasePointOfSaleResponse } from './point-of-sale-response';
import { BaseContainerResponse } from './container-response';
import { BaseProductResponse } from './product-response';
import { BaseUserResponse, UserResponse } from './user-response';
import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {BaseResponse} BaseTransactionResponse
 * @property {UserResponse.model} from.required - The account from which the transaction
 * is subtracted.
 * @property {UserResponse.model} createdBy - The user that created the transaction, if not
 * same as 'from'..
 * @property {BasePointOfSaleResponse.model} pointOfSale - The POS at which this transaction
 * has been created
 * @property {Dinero.model} value - Total sum of subtransactions
 */
export interface BaseTransactionResponse extends BaseResponse {
  from: UserResponse,
  createdBy?: UserResponse,
  pointOfSale: BasePointOfSaleResponse,
  value: DineroObject,
}

/**
 * @typedef {BaseResponse} TransactionResponse
 * @property {BaseUserResponse.model} from.required - The account from which the transaction
 * is subtracted.
 * @property {BaseUserResponse.model} createdBy - The user that created the transaction, if not
 * same as 'from'.
 * @property {Array.<SubTransactionResponse>} subTransactions.required - The subtransactions
 * belonging to this transaction.
 * @property {BasePointOfSaleResponse.model} pointOfSale - The POS at which this transaction
 * has been created
 * @property {DineroObjectResponse.model} totalPriceInclVat.required - The total cost of the
 * transaction
 */
export interface TransactionResponse extends BaseResponse {
  from: BaseUserResponse,
  createdBy?: BaseUserResponse,
  subTransactions: SubTransactionResponse[],
  pointOfSale: BasePointOfSaleResponse,
  totalPriceInclVat: DineroObjectResponse,
}

/**
 * @typedef {BaseResponse} SubTransactionResponse
 * @property {BaseUserResponse.model} to.required - The account that the transaction is added to.
 * @property {BaseContainerResponse.model} container.required - The container from which all
 * products in the SubTransactionRows are bought
 * @property {Array.<SubTransactionRowResponse>} subTransactionsRows.required - The rows of this
 *     SubTransaction
 * @property {DineroObjectResponse.model} totalPriceInclVat.required - The total cost of the sub
 *     transaction
 */
export interface SubTransactionResponse extends BaseResponse {
  to: BaseUserResponse,
  container: BaseContainerResponse,
  subTransactionRows: SubTransactionRowResponse[],
  totalPriceInclVat: DineroObjectResponse,
}

/**
 * @typedef {BaseResponse} SubTransactionRowResponse
 * @property {BaseProductResponse.model} product.required - The product that has been bought
 * @property {number} amount.required - The amount that has been bought
 * @property {DineroObjectResponse.model} totalPriceInclVat.required - The cost of the
 *     sub transaction row
 */
export interface SubTransactionRowResponse extends BaseResponse {
  product: BaseProductResponse,
  amount: number,
  totalPriceInclVat: DineroObjectResponse,
}

/**
 * @typedef PaginatedBaseTransactionResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array.<BaseTransactionResponse>} records - Returned banners
 */
export interface PaginatedBaseTransactionResponse {
  _pagination: PaginationResult,
  records: BaseTransactionResponse[],
}
