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
 * This is the module page of the balance-response.
 *
 * @module balance
 */

import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';
import { BaseUserResponse } from './user-response';
import { DineroObjectRequest } from '../request/dinero-request';
import { UserType } from '../../entity/user/user';

/**
 * @typedef {allOf|BaseUserResponse} BalanceResponse
 * @property {string} type.required - The user's type
 * @property {string} date.required - Date at which this user had this balance
 * @property {DineroObjectResponse} amount.required - The amount of balance this user has
 * @property {DineroObjectResponse} fine - The amount of fines this user has at the current point in time,
 * aka "now" (if any). Should be ignored if date is not now.
 * @property {DineroObjectResponse} fineWaived - The amount of fines that have been waived. Should be
 * subtracted from the "fine" property to calculate the actual amount of fines the user has. Only
 * represents the current point in time, aka "now" (if any). Should be ignored if date is not now.
 * @property {string} fineSince - Timestamp of the first fine
 * @property {integer} nrFines.required - The number of fines this user has received. 0 if no unpaid fines.
 * @property {number} lastTransactionId - The ID of the last transaction that was
 * present when the balance was cached. -1 if the user has not made any transactions
 * @property {string} lastTransactionDate - The timestamp of this user's last transaction. NULL if this
 * user has not made any transactions
 * @property {number} lastTransferId - The ID of the last transfer that was
 * present when the balance was cached. -1 if the user has not made any transfers
 */
export default interface BalanceResponse extends BaseUserResponse {
  type: UserType;
  date: string;
  amount: DineroObjectResponse;
  fine?: DineroObjectResponse | null;
  fineWaived?: DineroObjectRequest | null;
  fineSince?: string | null;
  nrFines: number;
  lastTransactionId: number;
  lastTransactionDate?: string | null;
  lastTransferId: number;
}

/**
 * @typedef {object} UserTypeTotalBalanceResponse
 * @property {string} userType.required - The user type
 * @property {DineroObjectResponse} totalPositive.required - The total amount of positive balance for this user type
 * @property {DineroObjectResponse} totalNegative.required - The total amount of negative balance for this uer type
 */
export interface UserTypeTotalBalanceResponse {
  userType: UserType,
  totalPositive: DineroObjectResponse,
  totalNegative: DineroObjectResponse,
}

/**
 * @typedef {object} TotalBalanceResponse
 * @property {string} date.required - Date at which this total balance was calculated
 * @property {number} totalPositive.required - The total amount of positive balance in SudoSOS
 * @property {number} totalNegative.required - The total amount of negative balance in SudoSOS
 * @property {UserTypeTotalBalanceResponse} userTypeBalances.required - The total balances for the different user types
 */
export interface TotalBalanceResponse {
  date: string;
  totalPositive: DineroObjectResponse;
  totalNegative: DineroObjectResponse;
  userTypeBalances: UserTypeTotalBalanceResponse[];
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
