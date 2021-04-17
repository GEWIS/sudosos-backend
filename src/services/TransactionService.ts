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
import { BaseTransactionResponse } from '../controller/response/transaction-response';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import { addPaginationToQueryBuilder } from '../helpers/pagination';
import DineroTransformer from '../entity/transformer/dinero-transformer';

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
          .innerJoin('subTransaction.subTransactionRows', 'subTransactionRow')
          .leftJoin('subTransactionRow.product', 'product')
          .where('subTransaction.transactionId = transaction.id');

        return applySubTransactionFilters(subquery);
      }, 'value')
      .leftJoinAndSelect('transaction.from', 'from')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
      .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
      .innerJoin('transaction.subTransactions', 'subTransaction')
      .innerJoin('subTransaction.subTransactionRows', 'subTransactionRow');

    if (filters.fromId) query.andWhere('"transaction"."fromId" = :fromId', { fromId: filters.fromId });
    if (filters.createdById) query.andWhere('"transaction"."createdById" = :createdById', { createdById: filters.createdById });
    if (filters.fromDate) query.andWhere('"transaction"."createdAt" >= :fromDate', { fromDate: filters.fromDate });
    if (filters.tillDate) query.andWhere('"transaction"."createdAt" < :tillDate', { tillDate: filters.tillDate });

    query = applySubTransactionFilters(query);
    query = addPaginationToQueryBuilder(req, query);

    const rawTransactions = await query.getRawMany();

    return rawTransactions.map((o) => {
      const v: BaseTransactionResponse = {
        id: o.transaction_id,
        createdAt: o.transaction_createdAt,
        updatedAt: o.transaction_updatedAt,
        from: {
          id: o.from_id,
          createdAt: o.from_createdAt,
          updatedAt: o.from_updatedAt,
          firstName: o.from_firstName,
          lastName: o.from_lastName,
          active: o.from_active,
          deleted: o.from_deleted,
          type: o.from_type,
        },
        createdBy: o.createdBy_id ? {
          id: o.createdBy_id,
          createdAt: o.createdBy_createdAt,
          updatedAt: o.createdBy_updatedAt,
          firstName: o.createdBy_firstName,
          lastName: o.createdBy_lastName,
          active: o.createdBy_active,
          deleted: o.createdBy_deleted,
          type: o.createdBy_type,
        } : undefined,
        pointOfSale: {
          id: o.pointOfSale_id,
          createdAt: o.pointOfSale_createdAt,
          updatedAt: o.pointOfSaleRev_updatedAt,
          name: o.pointOfSaleRev_name,
          revision: o.pointOfSale_revision,
          owner: undefined,
          startDate: o.pointOfSaleRev_startDate,
          endDate: o.pointOfSaleRev_endDate,
          products: undefined,
          useAuthentication: o.pointOfSaleRev_useAuthentication,
        },
        value: DineroTransformer.Instance.from(o.value || 0),
      };
      return v;
    });
  }
}
