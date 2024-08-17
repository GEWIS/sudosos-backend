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
import {
  EntityManager, FindManyOptions,
  FindOptionsRelations,
  FindOptionsWhere,
} from 'typeorm';
import { AppDataSource } from '../database/database';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import { PaginationParameters } from '../helpers/pagination';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { UpdateSellerPayoutRequest } from '../controller/request/seller-payout-request';
import Dinero, { Currency } from 'dinero.js';
import TransferService from './transfer-service';

export interface SellerPayoutFilterParameters {
  sellerPayoutId?: number;
  requestedById?: number;
  fromDate?: Date;
  tillDate?: Date;
  returnTransfer?: boolean;
}

export interface CreateSellerPayoutParams {
  requestedById: number;
  reference: string;
  startDate: Date;
  endDate: Date;
}

export default class SellerPayoutService {
  private manager: EntityManager;

  constructor(manager?: EntityManager) {
    this.manager = manager ?? AppDataSource.manager;
  }

  /**
   * Get seller payouts from database
   * @param params
   * @param pagination
   */
  public async getSellerPayouts(
    params: SellerPayoutFilterParameters,
    pagination: PaginationParameters = {},
  ): Promise<[SellerPayout[], number]> {
    const { take, skip } = pagination;
    const [data, count] = await this.manager.findAndCount(SellerPayout, {
      ...(SellerPayoutService.getOptions(params)),
      take,
      skip,
    });

    return [data, count];
  }

  /**
   * Create a new seller payout
   * @param params
   */
  public async createSellerPayout(params: CreateSellerPayoutParams): Promise<SellerPayout> {
    // TODO: calculate amount based on transaction reporting
    const amount = DineroTransformer.Instance.from(0);

    const transfer = await new TransferService().createTransfer({
      amount: amount.toObject(),
      description: `Seller payout: ${params.reference}`,
      fromId: params.requestedById,
      toId: null,
    });

    const payout = this.manager.getRepository(SellerPayout).create({
      ...params,
      amount,
      transfer,
    });


    const [[dbPayout]] = await this.getSellerPayouts({ sellerPayoutId: payout.id });
    return dbPayout;
  }

  /**
   * Update an existing seller payout
   * @param id
   * @param params
   */
  public async updateSellerPayout(id: number, params: UpdateSellerPayoutRequest): Promise<SellerPayout> {
    let [[payout]] = await this.getSellerPayouts({ sellerPayoutId: id, returnTransfer: true });
    if (!payout) {
      throw new Error(`Payout with ID "${id}" not found.`);
    }

    const { amount: amountReq, ...rest } = params;
    const amount = Dinero({
      amount: amountReq.amount,
      precision: amountReq.precision,
      currency: amountReq.currency as Currency,
    });
    await this.manager.getRepository(SellerPayout).update(id, {
      amount,
      ...rest,
    });

    const { transfer } = payout;
    transfer.amountInclVat = amount;
    await this.manager.save(transfer);

    [[payout]] = await this.getSellerPayouts({ sellerPayoutId: id });
    return payout;
  }

  /**
   * Delete an existing seller payout (with its corresponding transfer)
   * @param id
   */
  public async deleteSellerPayout(id: number) {
    const [[payout]] = await this.getSellerPayouts({ sellerPayoutId: id, returnTransfer: true });
    if (!payout) {
      throw new Error(`Payout with ID "${id}" not found.`);
    }

    await this.manager.remove(payout.transfer);
    await this.manager.remove(payout);
  }

  /**
   * Create filter options object
   * @param params
   */
  public static getOptions(params: SellerPayoutFilterParameters): FindManyOptions<SellerPayout> {
    const filterMapping: FilterMapping = {
      sellerPayoutId: 'id',
      requestedById: 'requestedBy.id',
    };

    const relations: FindOptionsRelations<SellerPayout> = {
      requestedBy: true,
      transfer: params.returnTransfer,
    };

    const where: FindOptionsWhere<SellerPayout> = {
      ...QueryFilter.createFilterWhereClause(filterMapping, params),
      createdAt: QueryFilter.createFilterWhereDate(params.fromDate, params.tillDate),
    };

    return { where, relations };
  }
}
