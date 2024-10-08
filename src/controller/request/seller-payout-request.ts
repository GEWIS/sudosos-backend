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
 * This is the module page of the seller-payout-request.
 *
 * @module seller-payouts
 */

import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef {object} CreateSellerPayoutRequest
 * @property {integer} requestedById.required - The user to create the Seller Payout for
 * @property {string} reference.required - Reference of the seller payout
 * @property {string} startDate.required - The lower bound of the range of transactions
 * to be paid out
 * @property {string} endDate.required - the upper bound of the range of transactions
 * to be paid out.
 */
export interface CreateSellerPayoutRequest {
  requestedById: number;
  reference: string;
  startDate: string;
  endDate: string;
}

/**
 * @typedef {object} UpdateSellerPayoutRequest
 * @property {DineroObjectRequest} amount.required - The new total value of the Seller Payout
 */
export interface UpdateSellerPayoutRequest {
  amount: DineroObjectRequest
}
