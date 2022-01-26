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
import Transfer from '../entity/transactions/transfer';
import { TransferResponse } from '../controller/response/transfer-response';
import TransferRequest from '../controller/request/transfer-request';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import User from '../entity/user/user';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import InvalidTransferError from '../entity/errors/invalid-transfer-error';

export interface TransferFilterParameters {
  id?: number;
  createdById?: number,
  fromId?: number,
  toId?: number
}

export default class TransferService {
  public static asTransferResponse(transfer: Transfer) : TransferResponse {
    return {
      amount: transfer.amount.toObject(),
      from: parseUserToBaseResponse(transfer.from, false),
      to: parseUserToBaseResponse(transfer.to, false),
      id: transfer.id,
      description: transfer.description,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
    };
  }

  private static async asTransfer(request: TransferRequest) : Promise<Transfer> {
    return Object.assign(new Transfer(), {
      description: request.description,
      amount: dinero(request.amount as Dinero.Options),
      from: request.fromId ? await User.findOne(request.fromId) : undefined,
      to: request.toId ? await User.findOne(request.toId) : undefined,
    });
  }

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
    return transfers.map(this.asTransferResponse);
  }

  public static async postTransfer(request: TransferRequest) : Promise<TransferResponse> {
    const transfer = await this.asTransfer(request);
    if (await this.verifyTransferRequest(request)) {
      await transfer.save();
      return this.asTransferResponse(transfer);
    }
    throw new InvalidTransferError('Transfer does not comply with requirements');
  }

  public static async verifyTransferRequest(request: TransferRequest) : Promise<boolean> {
    // the type of the request should be in TransferType enums
    // if the type is custom a description is necessary
    // a transfer is always at least from a valid user OR to a valid user
    // a transfer may be from null to an user, or from an user to null
    return (request.fromId || request.toId)
        && (await User.findOne(request.fromId) || await User.findOne(request.toId))
        && request.amount.precision === dinero.defaultPrecision
        && request.amount.currency === dinero.defaultCurrency;
  }
}
