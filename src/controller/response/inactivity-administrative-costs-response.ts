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
import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseUserResponse} InactivityAdministrativeCostsResponse
 * @property {string} email - If local user, the e-mail of the user
 * @property {boolean} sentAdministrativeCostsEmail.required - Whether the user has already received his cost notification
 * @property {number} amoun.required - The amount of administrative cost
 * @property {number} lastTransactionId - The id of the last transaction the user made
 * @property {number} lastTransferId - The id of the last transfer the user made
 */
export interface InactivityAdministrativeCostsResponse extends BaseUserResponse {
  email?: string;
  sentAdministrativeCostsEmail: boolean;
  amount: number;
  lastTransactionId?: number;
  lastTransferId?: number;
}

/**
 * @typedef {object} PaginatedInactivityAdministrativeCostsResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<InactivityAdministrativeCostsResponse>} records.required - Returned users and their info
 */
export interface PaginatedInactivityAdministrativeCostsResponse {
  _pagination: PaginationResult,
  records: InactivityAdministrativeCostsResponse[],
}
