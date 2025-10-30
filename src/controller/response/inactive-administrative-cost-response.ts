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

import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { TransferResponse } from './transfer-response';
import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} BaseInactiveAdministrativeCostResponse
 * @property {BaseUserResponse} from.required - The person from whom inactive administrative costs where transferred.
 * @property {DineroObjectResponse} amount.required - The amount which was deducted from the users account.
 * @property {TransferResponse} transfer - The linked transfer.
 */
export interface BaseInactiveAdministrativeCostResponse extends BaseResponse {
  from: BaseUserResponse,
  amount: DineroObjectResponse,
  transfer?: TransferResponse,
}

/**
 * @typedef {object} UserToInactiveAdministrativeCostResponse
 * @property {number} userId - User ID
 */
export interface UserToInactiveAdministrativeCostResponse {
  userId: number;
}

/**
 * @typedef {object} PaginatedInactiveAdministrativeCostResponse
 * @property {PaginationResult} _pagination  - Pagination metadata
 * @property {Array<BaseInactiveAdministrativeCostResponse>} records - Returned InactiveAdministrativeCost
 */
export interface PaginatedInactiveAdministrativeCostResponse {
  _pagination: PaginationResult,
  records: BaseInactiveAdministrativeCostResponse[]
}