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
import { BaseUserResponse } from './user-response';
import { TransactionResponse } from './transaction-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} FlaggedTransactionResponse
 * @property {string} status.required - enum:TODO,ACCEPTED,REJECTED - The status of this flag.
 * @property {BaseUserResponse} flaggedBy.required - The user created this flag.
 * @property {string} reason.required - The reason why this transaction should be changed.
 * @property {TransactionResponse} transaction.required - The transaction that has been flagged.
 */
export interface FlaggedTransactionResponse extends BaseResponse {
  status: string,
  flaggedBy: BaseUserResponse,
  reason: string,
  transaction: TransactionResponse,
}

/**
 * @typedef {object} PaginatedFlaggedTransactionResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<FlaggedTransactionResponse>} records.required - Returned flagged transactions
 */
export interface PaginatedFlaggedTransactionResponse {
  _pagination: PaginationResult,
  records: FlaggedTransactionResponse[],
}
