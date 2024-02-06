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
import { PaginationParameters } from '../helpers/pagination';
import {
  FlaggedTransactionResponse,
  PaginatedFlaggedTransactionResponse,
} from '../controller/response/flagged-transaction-response';
import FlaggedTransaction, { FlagStatus } from '../entity/transactions/flagged-transaction';
import { UserFilterParameters } from './user-service';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { FindManyOptions } from 'typeorm';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import TransactionService from './transaction-service';
import User from '../entity/user/user';
import Transaction from '../entity/transactions/transaction';
import UpdateFlaggedTransactionRequest from '../controller/request/UpdateFlaggedTransactionRequest';
import EventShift from '../entity/event/event-shift';

/**
 * Parameters used to filter on Get Flagged Transactions functions.
 */
interface FlaggedTransactionsFilterParameters {
  flaggedTransactionId?: number,
  status?: FlagStatus,
  flaggedBy?: UserFilterParameters,
  reason?: string,
}

export interface CreateFlaggedTransactionParams {
  status: number;
  reason: string;
  flaggedById: number;
  transactionId: number;
}

export default class FlaggedTransactionService {
  public static async asFlaggedTransactionResponse(transaction: FlaggedTransaction): Promise<FlaggedTransactionResponse> {
    return {
      flaggedBy: parseUserToBaseResponse(transaction.flaggedBy, false),
      id: transaction.id,
      reason: transaction.reason,
      status: FlagStatus[transaction.status],
      transaction: await TransactionService.asTransactionResponse(transaction.transaction),
    };
  }

  /**
   * Function for getting all flagged transactions
   * @param filters - Query filters to apply
   * @param pagination - Pagination to adhere to
   */
  public static async getFlaggedTransactions(
    filters: FlaggedTransactionsFilterParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedFlaggedTransactionResponse> {
    const { take, skip } = pagination;

    const mapping: FilterMapping = {
      flaggedTransactionId: 'id',
      status: 'status',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(mapping, filters),
      order: { id: 'DESC' },
    };

    const flaggedTransactions = await FlaggedTransaction.find({
      ...options,
      take,
      skip,
    });

    const records: FlaggedTransactionResponse[] = [];
    const promises = flaggedTransactions.map(async (flaggedTransaction) => {
      return records.push(await this.asFlaggedTransactionResponse(flaggedTransaction));
    });

    void Promise.all(promises);

    return {
      _pagination: {
        take,
        skip,
        count: await FlaggedTransaction.count(options),
      },
      records,
    };
  }

  /**
   * Creates a flagged transaction from a FlaggedTransactionRequest
   * @param {CreateFlaggedTransactionParams} params - Flagged transaction request
   * @returns {FlaggedTransaction.model} - Flagged transaction created
   */
  public static async createFlaggedTransaction(params: CreateFlaggedTransactionParams) : Promise<FlaggedTransactionResponse> {

    const flaggedBy = await User.findOne({ where: { id: params.flaggedById } });
    const transaction = await Transaction.findOne({
      where: { id: params.transactionId },
      relations: [
        'from', 'createdBy', 'subTransactions', 'subTransactions.to', 'subTransactions.subTransactionRows',
        // We query a lot here, but we will parse this later to a very simple BaseResponse
        'pointOfSale', 'pointOfSale.pointOfSale',
        'subTransactions.container', 'subTransactions.container.container',
        'subTransactions.subTransactionRows.product', 'subTransactions.subTransactionRows.product.product',
        'subTransactions.subTransactionRows.product.vat',
      ],
    });
    const flaggedTransaction: FlaggedTransaction = Object.assign(new FlaggedTransaction(), {
      status: params.status,
      flaggedBy,
      reason: params.reason,
      transaction,
      version: 1, // TODO: Handle logic for updating flagged transactions
    });
    await FlaggedTransaction.save(flaggedTransaction);
    return this.asFlaggedTransactionResponse(flaggedTransaction);
  }

  public static async updateFlaggedTransaction(id: number, param: UpdateFlaggedTransactionRequest) : Promise<FlaggedTransactionResponse> {
    const transaction = await FlaggedTransaction.findOne( { where: { id } } );
    if (!transaction) return undefined;
    transaction.status = param.status;
    await FlaggedTransaction.save(transaction);
    return this.asFlaggedTransactionResponse(transaction);
  }

  public static async getSingleFlaggedTransaction(id: number) : Promise<FlaggedTransactionResponse> {
    const transaction: FlaggedTransaction = await FlaggedTransaction.findOne( { where: { id } } );
    if (!transaction) return null;
    return this.asFlaggedTransactionResponse(transaction);
  }

  public static async deleteFlaggedTransaction(id: number) : Promise<FlaggedTransactionResponse> {
    const transaction: FlaggedTransaction = await FlaggedTransaction.findOne({ where: { id } } );

    if (!transaction) {
      return undefined;
    }

    await FlaggedTransaction.delete(id);

    return this.asFlaggedTransactionResponse(transaction);
  }
}
