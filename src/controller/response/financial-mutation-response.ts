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

import { PaginationResult } from '../../helpers/pagination';
import { TransferResponse } from './transfer-response';
import { BaseTransactionResponse } from './transaction-response';

type TransferType = {
  type: 'transfer',
  mutation: TransferResponse
};

type TransactionType = {
  type: 'transaction',
  mutation: BaseTransactionResponse
};

/**
 * @typedef {TransferType | TransactionType} FinancialMutationResponse
 */
export type FinancialMutationResponse = TransferType | TransactionType;

/**
 * @typedef PaginatedFinancialMutationResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<PaginatedFinancialMutationResponse.model>} records - Returned mutations
 */
export interface PaginatedFinancialMutationResponse {
  _pagination: PaginationResult,
  records: FinancialMutationResponse[],
}
