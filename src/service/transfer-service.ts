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

import dinero from 'dinero.js';
import { FindManyOptions } from 'typeorm';
import Transfer, { TransferType } from '../entity/transactions/transfer';
import { TransferResponse } from '../controller/response/transfer-response';
import TransferRequest from '../controller/request/transfer-request';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import User from '../entity/user/user';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';

export interface TransferFilterParameters {
  id?: number;
  createdById?: number,
  fromId?: number,
  toId?: number,
  type?: TransferType,
}

export default class TransferService {
  private static asTransferResponse(transfer: Transfer) : TransferResponse {
    return {
      amount: transfer.amount.toObject(),
      from: parseUserToBaseResponse(transfer.from, false),
      to: parseUserToBaseResponse(transfer.to, false),
      type: transfer.type,
      id: transfer.id,
      description: transfer.description,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
    };
  }

  private static async asTransfer(request: TransferRequest) : Promise<Transfer> {
    return Object.assign(new Transfer(), {
      description: request.description,
      type: request.type,
      amount: dinero(request.amount),
      from: await User.findOne(request.fromId),
      to: await User.findOne(request.toId),
    });
  }

  /**
   * Query for getting transfers.
   */
  public static async getTransfers(params: TransferFilterParameters = {})
    : Promise<TransferResponse[]> {
    const filterMapping: FilterMapping = {
      id: 'id',
      createdById: 'createdById',
      fromId: 'fromId',
      toId: 'toId',
      type: 'type',
    };
    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['from', 'to'],
    };
    const transfers = await Transfer.find(options);
    return transfers.map(
      (transfer) => (this.asTransferResponse(transfer)),
    );
  }

  /**
   * Saves a Transfer to the database.
   * @param request - The TransferRequest with values.
   */
  public static async postTransfer(request: TransferRequest) : Promise<TransferResponse> {
    const transfer = await this.asTransfer(request);
    await transfer.save();
    return this.asTransferResponse(transfer);
  }

  /**
   * Verifies whether the transfer request translates to a valid transfer
   * @param {TransferRequest.model} request
   * - the transfer request to verify
   * @returns {boolean} - whether transfer is ok or not
   */
  public static async verifyTransferRequest(request: TransferRequest) : Promise<boolean> {
    // the type of the request should be in TransferType enums
    // if the type is custom a description is necessary
    // a transfer is always at least from a valid user OR to a valid user
    // a transfer may be from null to an user, or from an user to null
    return request.type in TransferType
        && (request.type !== TransferType.CUSTOM || request.description !== '')
        && (await User.findOne(request.fromId) || await User.findOne(request.toId))
        && request.amount.precision === dinero.defaultPrecision
        && request.amount.currency === dinero.defaultCurrency;
  }
}
