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
 * This is the module page of the voucher-group-request.
 *
 * @module vouchers
 */

import DineroFactory from 'dinero.js';
import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef {object} VoucherGroupRequest
 * @property {string} name.required - Name of the group
 * @property {string} activeStartDate.required - Date from which the included cards are active
 * @property {string} activeEndDate.required - Date from which cards are no longer active
 * @property {DineroObjectRequest} balance.required - Start balance to be assigned
 *  to the voucher users
 * @property {number} amount.required - Amount of users to be assigned to the voucher group
 */
export interface VoucherGroupRequest {
  name: string,
  activeStartDate: string,
  activeEndDate: string,
  balance: DineroObjectRequest,
  amount: number,
}

export interface VoucherGroupParams {
  name: string,
  activeStartDate: Date,
  activeEndDate: Date,
  balance: DineroFactory.Dinero,
  amount: number,
}
