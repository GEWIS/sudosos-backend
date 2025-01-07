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
 *
 *  @license
 */

import { Dinero } from 'dinero.js';
import User from '../entity/user/user';
import WithManager from '../database/with-manager';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import ProductRevision from '../entity/product/product-revision';
import { SelectQueryBuilder } from 'typeorm';
import DineroTransformer from '../entity/transformer/dinero-transformer';

interface BaseSummary {
  user: User;
  totalInclVat: Dinero;
  amountOfProducts: number;
}

interface ProductSummary extends BaseSummary {
  productId: number;
}

interface ContainerSummary extends BaseSummary {
  containerId: number;
}

interface PointOfSaleSummary extends BaseSummary {
  pointOfSaleId: number;
}

interface UserSummary extends BaseSummary {
  user: User;
  products: ProductSummary[];
  containers: ContainerSummary[];
  pointsOfSale: PointOfSaleSummary[];
}

interface SummaryFilters {
  containerId?: number;
}

export default class TransactionSummaryService extends WithManager {
  private getBaseQueryBuilder(): SelectQueryBuilder<User> {
    return this.manager.createQueryBuilder(User, 'user')
      .innerJoinAndSelect(Transaction, 'transaction', 'transaction.fromId = user.id')
      .innerJoinAndSelect(SubTransaction, 'subTransaction', 'subTransaction.transactionId = transaction.id')
      // .innerJoinAndSelect(ContainerRevision, 'containerRevision', 'containerRevision.containerId = subTransaction.containerContainerId AND containerRevision.revision = subTransaction.containerRevision')
      .innerJoinAndSelect(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.subTransactionId = subTransaction.id')
      .innerJoin(ProductRevision, 'productRevision', 'productRevision.productId = subTransactionRow.productProductId AND productRevision.revision = subTransactionRow.productRevision')
      .addSelect('sum(subTransactionRow.amount * productRevision.priceInclVat) as totalValueInclVat')
      .addSelect('sum(subTransactionRow.amount) as totalAmount');
  }

  private addFilters<T>(query: SelectQueryBuilder<T>, filters?: SummaryFilters): SelectQueryBuilder<T> {
    if (!filters) return query;
    if (filters.containerId) query.where('subTransaction.containerContainerId = :containerId', { containerId: filters.containerId });
    return query;
  }

  public async getContainerSummary(filters?: SummaryFilters): Promise<ContainerSummary[]> {
    const query = this.getBaseQueryBuilder()
      .groupBy('user.id, subTransaction.containerContainerId');

    const data = await this.addFilters(query, filters)
      .getRawAndEntities();

    return data.raw.map((r): ContainerSummary => {
      const user = data.entities.find((u) => u.id === r.user_id);
      return {
        user,
        totalInclVat: DineroTransformer.Instance.from(r.totalValueInclVat),
        amountOfProducts: r.totalAmount,
        containerId: r.subTransaction_containerContainerId,
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getSummary(filters?: SummaryFilters): Promise<UserSummary> {
    throw new Error('Not yet implemented');
  }
}
