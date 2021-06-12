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
import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';
import { BaseTransactionResponse, TransactionResponse } from '../controller/response/transaction-response';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import { addPaginationToQueryBuilder } from '../helpers/pagination';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import {
  parseContainerToBaseResponse,
  parsePOSToBasePOS,
  parseProductToBaseResponse,
} from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { TransactionRequest } from '../controller/request/transaction-request';

export interface TransactionFilterParameters {
  fromId?: number,
  createdById?: number,
  toId?: number,
  pointOfSaleId?: number,
  pointOfSaleRevision?: number,
  containerId?: number,
  containerRevision?: number,
  productId?: number,
  productRevision?: number,
  fromDate?: Date,
  tillDate?: Date,
}

export default class TransactionService {
  public static async verifyTransaction(req: TransactionRequest): Promise<boolean> {
    return true;
  }

  public static asTransaction(req: TransactionRequest): Transaction {
    return null;
  }

  public static asTransactionResponse(transaction: Transaction): TransactionResponse {
    return null;
  }

  public static async getTransactions(
    req: RequestWithToken, params: TransactionFilterParameters,
  ): Promise<BaseTransactionResponse[]> {
    // Extract fromDate and tillDate, as they cannot be directly passed to QueryFilter.
    const { fromDate, tillDate, ...p } = params;

    function applySubTransactionFilters(query: SelectQueryBuilder<any>): SelectQueryBuilder<any> {
      const mapping: FilterMapping = {
        toId: 'subTransaction.toId',
        pointOfSaleId: 'transaction.pointOfSalePointOfSale',
        pointOfSaleRevision: 'transaction.pointOfSaleRevision',
        containerId: 'subTransaction.containerContainer',
        containerRevision: 'subTransaction.containerRevision',
        productId: 'subTransactionRow.productProduct',
        productRevision: 'subTransactionRow.productRevision',
      };

      return QueryFilter.applyFilter(query, mapping, p);
    }

    let query = createQueryBuilder(Transaction, 'transaction')
      .addSelect((qb) => {
        const subquery = qb.subQuery()
          .select('sum(subTransactionRow.amount * product.price) as value')
          .from(SubTransaction, 'subTransaction')
          .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
          .leftJoin('subTransactionRow.product', 'product')
          .where('subTransaction.transactionId = transaction.id');

        return applySubTransactionFilters(subquery);
      }, 'value')
      .leftJoinAndSelect('transaction.from', 'from')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
      .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
      .leftJoin('transaction.subTransactions', 'subTransaction')
      .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow');

    if (fromDate) query.andWhere('"transaction"."createdAt" >= :fromDate', { fromDate: fromDate.toISOString() });
    if (tillDate) query.andWhere('"transaction"."createdAt" < :tillDate', { tillDate: tillDate.toISOString() });
    const mapping = {
      fromId: 'transaction.fromId',
      createdById: 'transaction.createdById',
    };
    QueryFilter.applyFilter(query, mapping, p);

    query = applySubTransactionFilters(query);
    query = addPaginationToQueryBuilder(req, query);

    const rawTransactions = await query.getRawMany();

    return rawTransactions.map((o) => {
      const value = DineroTransformer.Instance.from(o.value || 0);
      const v: BaseTransactionResponse = {
        id: o.transaction_id,
        createdAt: new Date(o.transaction_createdAt).toISOString(),
        updatedAt: new Date(o.transaction_updatedAt).toISOString(),
        from: {
          id: o.from_id,
          createdAt: new Date(o.from_createdAt).toISOString(),
          updatedAt: new Date(o.from_updatedAt).toISOString(),
          firstName: o.from_firstName,
          lastName: o.from_lastName,
          active: o.from_active === 1,
          deleted: o.from_deleted === 1,
          type: o.from_type,
        },
        createdBy: o.createdBy_id ? {
          id: o.createdBy_id,
          createdAt: new Date(o.createdBy_createdAt).toISOString(),
          updatedAt: new Date(o.createdBy_updatedAt).toISOString(),
          firstName: o.createdBy_firstName,
          lastName: o.createdBy_lastName,
          active: o.from_active === 1,
          deleted: o.from_deleted === 1,
          type: o.createdBy_type,
        } : undefined,
        pointOfSale: {
          id: o.pointOfSale_id,
          createdAt: new Date(o.pointOfSale_createdAt).toISOString(),
          updatedAt: new Date(o.pointOfSaleRev_updatedAt).toISOString(),
          name: o.pointOfSaleRev_name,
        },
        value: value.toObject(),
      };
      return v;
    });
  }

  public static async createTransaction(req: TransactionRequest): Promise<TransactionResponse> {
    return {} as TransactionResponse;
  }

  public static async getSingleTransaction(id: number): Promise<TransactionResponse | undefined> {
    const transaction = await Transaction.findOne(id, {
      relations: [
        'from', 'createdAt', 'updatedAt', 'createdBy', 'subTransactions', 'subTransactions.to', 'subTransactions.subTransactionRows',
        // We query a lot here, but we will parse this later to a very simple BaseResponse
        'pointOfSale', 'pointOfSale.pointOfSale',
        'subTransactions.container', 'subTransactions.container.container',
        'subTransactions.subTransactionRows.product', 'subTransactions.subTransactionRows.product.product',
      ],
    });

    if (transaction === undefined) return undefined;

    return {
      id: transaction.id,
      from: parseUserToBaseResponse(transaction.from, false),
      createdBy: transaction.createdBy
        ? parseUserToBaseResponse(transaction.createdBy, false)
        : undefined,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      pointOfSale: parsePOSToBasePOS(transaction.pointOfSale, false),
      subTransactions: transaction.subTransactions.map((s) => ({
        id: s.id,
        to: parseUserToBaseResponse(s.to, false),
        container: parseContainerToBaseResponse(s.container, false),
        subTransactionRows: s.subTransactionRows.map((r) => ({
          id: r.id,
          amount: r.amount,
          product: parseProductToBaseResponse(r.product, false),
        })),
      })),
    } as TransactionResponse;
  }
}
