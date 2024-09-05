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
import WriteOff from '../entity/transactions/write-off';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import TransferService from './transfer-service';
import {
  BaseWriteOffResponse,
  PaginatedWriteOffResponse,
  WriteOffResponse,
} from '../controller/response/write-off-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import {
  FindManyOptions,
  FindOptionsRelations,
  FindOptionsWhere,
} from 'typeorm';
import ContainerRevision from '../entity/container/container-revision';
import { PaginationParameters } from '../helpers/pagination';
import User from '../entity/user/user';
import BalanceService from './balance-service';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import UserService from './user-service';
import { RequestWithToken } from '../middleware/token-middleware';
import { asNumber } from '../helpers/validators';
import VatGroup from '../entity/vat-group';
import ServerSettingsStore from '../server-settings/server-settings-store';
import Transfer from '../entity/transactions/transfer';
import { ISettings } from '../entity/server-setting';
import WithManager from '../database/with-manager';

export interface WriteOffFilterParameters {
  /**
   * Filter based on to user.
   */
  toId?: number;
  /**
   * Filter based on write-off id.
   */
  writeOffId?: number;
}

export function parseWriteOffFilterParameters(req: RequestWithToken): WriteOffFilterParameters {
  return {
    writeOffId: asNumber(req.query.writeOffId),
    toId: asNumber(req.query.toId),
  };
}
export default class WriteOffService extends WithManager {
  /**
   * Parses a write-off object to a BaseWriteOffResponse
   * @param writeOff
   */
  public static asBaseWriteOffResponse(writeOff: WriteOff): BaseWriteOffResponse {
    return {
      id: writeOff.id,
      createdAt: writeOff.createdAt.toISOString(),
      updatedAt: writeOff.updatedAt.toISOString(),
      to: parseUserToBaseResponse(writeOff.to, false),
      amount: writeOff.amount.toObject(),
    };
  }

  /**
   * Parses a write-off object to a WriteOffResponse
   * @param writeOff
   */
  public static asWriteOffResponse(writeOff: WriteOff): WriteOffResponse {
    return {
      ...this.asBaseWriteOffResponse(writeOff),
      transfer: writeOff.transfer ? TransferService.asTransferResponse(writeOff.transfer) : undefined,
    };
  }

  /**
   * Returns all write-offs with options.
   * @param filters - The filtering parameters.
   * @param pagination - The pagination options.
   * @returns {Array.<WriteOffResponse>} - all write-offs
   */
  public static async getWriteOffs(filters: WriteOffFilterParameters = {}, pagination: PaginationParameters = {}): Promise<PaginatedWriteOffResponse> {
    const { take, skip } = pagination;

    const options = this.getOptions(filters);
    const [data, count] = await WriteOff.findAndCount({ ...options, take, skip });

    const records = data.map((writeOff) => this.asWriteOffResponse(writeOff));

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  private static async getHighVATGroup(): Promise<VatGroup> {
    const id = ServerSettingsStore.getInstance().getSetting('highVatGroupId') as ISettings['highVatGroupId'];
    const vatGroup = await VatGroup.findOne({ where: { id } });
    if (vatGroup) return vatGroup;
    else throw new Error('High vat group not found');
  }

  /**
   * Creates a write-off for the given user
   * @param manager - The entity manager to use
   * @param user - The user to create the write-off for
   */
  public async createWriteOff(user: User): Promise<WriteOffResponse> {
    const balance = await new BalanceService().getBalance(user.id);
    if (balance.amount.amount > 0) {
      throw new Error('User has balance, cannot create write off');
    }

    const amount = DineroTransformer.Instance.from(balance.amount.amount * -1);

    const writeOff = Object.assign(new WriteOff(), {
      to: user,
      amount,
    });

    await this.manager.save(writeOff);
    const transfer = await (new TransferService()).createTransfer({
      amount: {
        amount: amount.getAmount(),
        precision: amount.getPrecision(),
        currency: amount.getCurrency(),
      },
      toId: user.id,
      description: 'Write off',
      fromId: null,
    });

    const highVatGroup = await WriteOffService.getHighVATGroup();
    writeOff.transfer = transfer;
    transfer.writeOff = writeOff;
    transfer.vat = highVatGroup;

    await this.manager.getRepository(Transfer).save(transfer);
    await this.manager.getRepository(WriteOff).save(writeOff);
    return WriteOffService.asWriteOffResponse(writeOff);
  }

  // TODO: This should be a transaction
  //   wait for BalanceService to be refactored
  public async createWriteOffAndCloseUser(user: User): Promise<WriteOffResponse> {
    const writeOff = await this.createWriteOff(user);
    await UserService.closeUser(user.id, true);
    return writeOff;
  }

  /**
   * Function that returns FindManyOptions based on the given parameters
   * @param params
   */
  public static getOptions(params: WriteOffFilterParameters): FindManyOptions<WriteOff> {
    const filterMapping: FilterMapping = {
      toId: 'to.id',
      writeOffId: 'id',
    };

    const relations: FindOptionsRelations<WriteOff> = {
      transfer: {
        vat: true,
      },
    };

    let where: FindOptionsWhere<ContainerRevision> = {
      ...QueryFilter.createFilterWhereClause(filterMapping, params),
    };

    const options: FindManyOptions<WriteOff> = {
      where,
      order: { createdAt: 'DESC' },
      relations,
    };

    return { ...options, relations };
  }

}
