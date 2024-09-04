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
import { UpdateSellerPayoutRequest } from '../controller/request/seller-payout-request';
import Dinero, { Currency } from 'dinero.js';
import TransferService from './transfer-service';
import User from '../entity/user/user';
import { SellerPayoutResponse } from '../controller/response/seller-payout-response';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate, asNumber } from '../helpers/validators';
import { SalesReportService } from './report-service';

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

export function parseSellerPayoutFilters(req: RequestWithToken): SellerPayoutFilterParameters {
  return {
    requestedById: asNumber(req.query.requestedById),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
  };
}

export default class SellerPayoutService {
  private manager: EntityManager;

  constructor(manager?: EntityManager) {
    this.manager = manager ?? AppDataSource.manager;
  }

  public static asSellerPayoutResponse(payout: SellerPayout): SellerPayoutResponse {
    return {
      id: payout.id,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
      version: payout.version,
      requestedBy: parseUserToBaseResponse(payout.requestedBy, false),
      amount: payout.amount.toObject(),
      startDate: payout.startDate.toISOString(),
      endDate: payout.endDate.toISOString(),
      reference: payout.reference,
    };
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
    const report = await new SalesReportService().getReport({
      forId: params.requestedById,
      fromDate: params.startDate,
      tillDate:params.endDate,
    });
    const amount = report.totalInclVat;

    const requestedBy = await this.manager.getRepository(User)
      .findOne({ where: { id: params.requestedById } });
    if (!requestedBy) {
      throw new Error(`User with ID "${params.requestedById}" not found.`);
    }

    const transfer = await new TransferService().createTransfer({
      createdAt: params.endDate.toISOString(),
      amount: amount.toObject(),
      description: `Seller payout: ${params.reference}`,
      fromId: params.requestedById,
      toId: null,
    });

    const payout = await this.manager.getRepository(SellerPayout).save({
      ...params,
      requestedBy,
      amount,
      transfer,
    });


    const [[dbPayout]] = await this.getSellerPayouts({ sellerPayoutId: payout.id, returnTransfer: true });
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

    [[payout]] = await this.getSellerPayouts({ sellerPayoutId: id, returnTransfer: true });
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

    await this.manager.remove(payout);
    await this.manager.remove(payout.transfer);
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

    const whereOptions: FindOptionsWhere<SellerPayout> = QueryFilter.createFilterWhereClause(filterMapping, params);
    const whereOptionsDates = QueryFilter.createFilterWhereDateRange<SellerPayout>('startDate', 'endDate', params.fromDate, params.tillDate);

    let where: FindOptionsWhere<SellerPayout>[];
    if (whereOptionsDates.length > 0) {
      where = whereOptionsDates.map((w) => ({
        ...w,
        ...whereOptions,
      }));
    } else {
      where = [whereOptions];
    }

    return {
      where,
      relations,
      order: { endDate: 'DESC' },
    };
  }
}
