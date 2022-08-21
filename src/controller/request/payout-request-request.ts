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
import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef PayoutRequestRequest
 * @property {DineroObjectRequest.model} amount.required - The requested amount to be paid out
 * @property {string} bankAccountNumber.required - The bank account number to transfer the money to
 * @property {string} bankAccountName.required - The name of the owner of the bank account
 */
export default interface PayoutRequestRequest {
  amount: DineroObjectRequest;
  bankAccountNumber: string;
  bankAccountName: string;
}
