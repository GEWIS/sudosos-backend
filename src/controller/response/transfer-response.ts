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

import BaseResponse from './base-response';
import { DineroObjectResponse } from './dinero-response';
import { BaseUserResponse } from './user-response';

/**
 * @typedef {BaseResponse} TransferResponse
 * @property {string} description - Description of the transfer
 * @property {Dinero.model} amount - Amount of money being transferred
 * @property {integer} type - Type of transfer
 * @property {BaseUserResponse.model} from - from which user the money is being transferred
 * @property {BaseUserResponse.model} to - to which user the money is being transferred.
 */
export interface TransferResponse extends BaseResponse {
  amount: DineroObjectResponse;
  description: string;
  from: BaseUserResponse;
  to: BaseUserResponse;
}
