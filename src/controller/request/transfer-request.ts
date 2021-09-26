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

import { DineroObject } from 'dinero.js';
import { TransferType } from '../../entity/transactions/transfer';

/**
 * @typedef TransferRequest
 * @property {string} description - Description of the transfer
 * @property {Dinero.model} amount - Amount of money being transferred
 * @property {TransferType} type - Type of transfer
 * @property {integer} fromId - from which user the money is being transferred
 * @property {integer} toId - to which user the money is being transferred.
 */
export default interface TransferRequest {
  amount: DineroObject;
  type: TransferType;
  description: string;
  fromId: number;
  toId: number;
}
