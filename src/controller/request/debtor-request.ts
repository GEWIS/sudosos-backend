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
 * This is the module page of the debtor-request.
 *
 * @module debtors
 */

import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef {object} HandoutFinesRequest
 * @property {Array<integer>} userIds.required - Users to fine. If a user is not eligible for a fine, a fine of 0,00 will be handed out.
 * @property {string} referenceDate.required - Reference date to calculate the balance and thus the height of the fine for.
 */
export interface HandoutFinesRequest {
  userIds: number[];
  referenceDate: string;
}

/**
 * The total request and all its fields are optional for backwards compatibility's sake.
 * If this request object is extended, it is probably best to make everything required
 * and remove the backwards compatibility, as the frontend will (and should) already use
 * this new object. See https://github.com/GEWIS/sudosos-backend/pull/344
 *
 * @typedef {object} WaiveFinesRequest
 * @property {DineroObjectRequest} amount - The amount of fines that have to be
 * waived. Cannot be negative or more than the total amount of unpaid fines.
 */
export interface WaiveFinesRequest {
  /**
   * The amount of fines that have to be waived. Cannot be
   * negative or more than the total amount of unpaid fines.
   */
  amount?: DineroObjectRequest;
}
