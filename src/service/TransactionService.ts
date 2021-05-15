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

export interface TransactionFilters {
  fromId?: number,
  createdById?: number,
  toId?: number,
  pointOfSale?: {
    id: number,
    revision?: number,
  }
  container?: {
    id: number,
    revision?: number,
  },
  product?: {
    id: number,
    revision?: number,
  }
  fromDate?: Date,
  tillDate?: Date,
}

export default class TransactionService {
  public static async getTransactions(
    req: RequestWithToken, filters: TransactionFilters,
  ): Promise<BaseTransactionResponse[]> {
    function applySubTransactionFilters(query: SelectQueryBuilder<any>): SelectQueryBuilder<any> {
      if (filters.toId) {
        query.andWhere('"subTransaction"."toId" = :toId', { toId: filters.toId });
      }

      if (filters.pointOfSale) {
        query.andWhere('"transaction"."pointOfSalePointOfSale" = :pointOfSaleId', { pointOfSaleId: filters.pointOfSale.id });
        if (filters.pointOfSale.revision) {
          query.andWhere('"transaction"."pointOfSaleRevision" = :pointOfSaleRevision', { pointOfSaleRevision: filters.pointOfSale.revision });
        }
      }

      if (filters.container) {
        query.andWhere('"subTransaction"."containerContainer" = :containerId', { containerId: filters.container.id });
        if (filters.container.revision) {
          query.andWhere('"subTransaction"."containerRevision" = :containerRevision', { containerRevision: filters.container.revision });
        }
      }

      if (filters.product) {
        query.andWhere('"subTransactionRow"."productProduct" = :productId', { productId: filters.product.id });
        if (filters.product.revision) {
          query.andWhere('"subTransactionRow"."productRevision" = :productRevision', { productRevision: filters.product.revision });
        }
      }

      return query;
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

    if (filters.fromId) query.andWhere('"transaction"."fromId" = :fromId', { fromId: filters.fromId });
    if (filters.createdById) query.andWhere('"transaction"."createdById" = :createdById', { createdById: filters.createdById });
    if (filters.fromDate) query.andWhere('"transaction"."createdAt" >= :fromDate', { fromDate: filters.fromDate.toISOString() });
    if (filters.tillDate) query.andWhere('"transaction"."createdAt" < :tillDate', { tillDate: filters.tillDate.toISOString() });

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
