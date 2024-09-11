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

import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {object} BalanceResponse
 * @property {number} id.required - ID of the user this balance belongs to
 * @property {string} date.required - Date at which this user had this balance
 * @property {DineroObjectResponse} amount.required - The amount of balance this user has
 * @property {DineroObjectResponse} fine - The amount of fines this user has at the current point in time,
 * aka "now" (if any). Should be ignored if date is not now.
 * @property {string} fineSince - Timestamp of the first fine
 * @property {number} lastTransactionId - The ID of the last transaction that was
 * present when the balance was cached
 * @property {number} lastTransferId - The ID of the last transfer that was
 * present when the balance was cached
 */
export default interface BalanceResponse {
  id: number;
  date: string;
  amount: DineroObjectResponse;
  fine?: DineroObjectResponse | null;
  fineSince?: string | null;
  lastTransactionId: number;
  lastTransferId: number;
}

/**
 * @typedef {object} PaginatedBalanceResponse
 * @property {PaginationResult} _pagination - Pagination metadata
 * @property {Array<BalanceResponse>} records - Returned balance responses
 */
export interface PaginatedBalanceResponse {
  _pagination: PaginationResult,
  records: BalanceResponse[];
}
