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

import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef {object} PayoutRequestRequest
 * @property {DineroObjectRequest} amount.required - The requested amount to be paid out
 * @property {string} bankAccountNumber.required - The bank account number to transfer the money to
 * @property {string} bankAccountName.required - The name of the owner of the bank account
 * @property {integer} forId.required - The ID of the user who requested the payout
 */
export default interface PayoutRequestRequest {
  amount: DineroObjectRequest;
  bankAccountNumber: string;
  bankAccountName: string;
  forId: number;
}
