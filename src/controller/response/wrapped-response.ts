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
import BaseResponse from './base-response';

/**
 * @typedef {allOf|BaseResponse} WrappedResponse
 * @property {integer} userId.required - The ID of the user
 * @property {WrappedTransactions} transactions.required - The wrapped transactions info of the user
 * @property {number} spentPercentile.required - The top percentile of the user based on amount spent
 * @property {string} syncedFrom.required - The starting date from which the data was considered
 * @property {string} syncedTo.required - The last time the data was synced
 * @property {Array.<WrappedOrganMemberResponse>} organs.required - Organ member statistics for the user
 */
export default interface WrappedResponse extends BaseResponse {
  userId: number;
  transactions: WrappedTransactions;
  spentPercentile: number;
  syncedFrom: string;
  syncedTo: string;
  organs: WrappedOrganMemberResponse[];
}

/**
 * @typedef {object} WrappedTransactions
 * @property {integer} transactionCount.required - The total number of transaction in the past year
 * @property {number} transactionPercentile.required - The top percentile of the user based on the amount of transactions
 * @property {string} transactionMaxDate.required - The date the user made the highest amount of transactions
 * @property {number} transactionMaxAmount.required - The highest amount of transactions made by the user on a single day
 * @property {Array.<integer>} transactionHeatmap.required - Heatmap data representing transaction activity over the year
 */
export interface WrappedTransactions {
  transactionCount: number;
  transactionPercentile: number;
  transactionMaxDate: string;
  transactionMaxAmount: number;
  transactionHeatmap: number[];
}

/**
 * @typedef {object} WrappedOrganMemberResponse
 * @property {integer} organId.required - The ID of the organ
 * @property {integer} ordinalTransactionCreated.required - 0-based ranking for transaction count created
 * @property {integer} ordinalTurnoverCreated.required - 0-based ranking for turnover amount created
 */
export interface WrappedOrganMemberResponse {
  organId: number;
  ordinalTransactionCreated: number;
  ordinalTurnoverCreated: number;
}