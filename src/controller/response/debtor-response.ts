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

import { DineroObjectResponse } from './dinero-response';
import BaseResponse from './base-response';
import { PaginationResult } from '../../helpers/pagination';
import { BaseUserResponse } from './user-response';
import BalanceResponse from './balance-response';
import {Dinero} from "dinero.js";

/**
 * @typedef {object} UserToFineResponse
 * @property {integer} id.required - User ID
 * @property {DineroObjectResponse} fineAmount.required - Amount to fine
 * @property {Array<BalanceResponse>} balances.required - Balances at the given reference dates
 */
export interface UserToFineResponse {
  id: number;
  fineAmount: DineroObjectResponse;
  balances: BalanceResponse[]
}

export interface FineReport {
  fromDate: Date;
  toDate: Date;
  count: number;
  handedOut: Dinero;
  waivedCount: number;
  waivedAmount: Dinero;
}

/**
 * @typedef {object} FineReportResponse
 * @property {string} fromDate.required - From date of the report
 * @property {string} toDate.required - To date of the report
 * @property {number} count.required - Number of fines
 * @property {DineroObjectResponse} handedOut.required - Amount of fines handed out
 * @property {number} waivedCount.required - Number of fines waived
 * @property {DineroObjectResponse} waived.required - Amount of fines waived
 */
export interface FineReportResponse {
  fromDate: string;
  toDate: string;
  count: number;
  handedOut: DineroObjectResponse;
  waivedCount: number;
  waived: DineroObjectResponse;
}

/**
 * @typedef {allOf|BaseResponse} FineResponse
 * @property {DineroObjectResponse} amount.required - Fine amount
 * @property {BaseUserResponse} user.required - User that got the fine
 */
export interface FineResponse extends BaseResponse {
  amount: DineroObjectResponse;
  user: BaseUserResponse;
}

/**
 * @typedef {allOf|BaseResponse} BaseFineHandoutEventResponse
 * @property {string} referenceDate.required - Reference date of fines
 * @property {BaseUserResponse} createdBy.required - User that handed out the fines
 */
export interface BaseFineHandoutEventResponse extends BaseResponse {
  referenceDate: string;
  createdBy: BaseUserResponse;
}

/**
 * @typedef {allOf|BaseFineHandoutEventResponse} FineHandoutEventResponse
 * @property {Array<FineResponse>} fines.required - Fines that have been handed out
 */
export interface FineHandoutEventResponse extends BaseFineHandoutEventResponse {
  fines: FineResponse[];
}

/**
 * @typedef {object} PaginatedFineHandoutEventResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<BaseFineHandoutEventResponse>} records.required - Returned fine handout events
 */
export interface PaginatedFineHandoutEventResponse {
  _pagination: PaginationResult,
  records: BaseFineHandoutEventResponse[],
}

/**
 * @typedef {object} UserFineGroupResponse
 * @property {Array<FineResponse>} fines.required - Fines that have been handed out
 */
export interface UserFineGroupResponse {
  fines: FineResponse[];
}
