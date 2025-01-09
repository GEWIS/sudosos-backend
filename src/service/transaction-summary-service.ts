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

/**
 * This is the module page of the transaction summaries.
 * Not that this module has been created in very strict time constraints,
 * so its implementation is very minimal.
 * https://github.com/GEWIS/sudosos-backend/pull/415
 *
 * @module transaction-summaries
 */

import Dinero from 'dinero.js';
import User from '../entity/user/user';
import WithManager from '../database/with-manager';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import ProductRevision from '../entity/product/product-revision';
import { SelectQueryBuilder } from 'typeorm';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { ContainerSummaryResponse } from '../controller/response/transaction-summary-response';

interface BaseSummary {
  user: User;
  totalInclVat: Dinero.Dinero;
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

interface SummaryTotals extends Pick<BaseSummary, 'totalInclVat' | 'amountOfProducts'> {}

/**
 * Minimal implementation of the summary service.
 * https://github.com/GEWIS/sudosos-backend/pull/415
 */
export default class TransactionSummaryService extends WithManager {
  public static toContainerSummaryResponse(containerSummary: ContainerSummary): ContainerSummaryResponse {
    return {
      user: {
        id: containerSummary.user.id,
        firstName: containerSummary.user.firstName,
        nickname: containerSummary.user.nickname,
        lastName: containerSummary.user.lastName,
      },
      totalInclVat: containerSummary.totalInclVat.toObject(),
      amountOfProducts: containerSummary.amountOfProducts,
      containerId: containerSummary.containerId,
    };
  }

  private addFilters<T>(query: SelectQueryBuilder<T>, filters?: SummaryFilters): SelectQueryBuilder<T> {
    if (!filters) return query;
    if (filters.containerId) query.where('subTransaction.containerContainerId = :containerId', { containerId: filters.containerId });
    return query;
  }

  private getBaseQueryBuilder(filters?: SummaryFilters): SelectQueryBuilder<User> {
    let query = this.manager.createQueryBuilder(User, 'user')
      .innerJoinAndSelect(Transaction, 'transaction', 'transaction.fromId = user.id')
      .innerJoinAndSelect(SubTransaction, 'subTransaction', 'subTransaction.transactionId = transaction.id')
      .innerJoinAndSelect(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.subTransactionId = subTransaction.id')
      .innerJoin(ProductRevision, 'productRevision', 'productRevision.productId = subTransactionRow.productProductId AND productRevision.revision = subTransactionRow.productRevision')
      .addSelect('sum(subTransactionRow.amount * productRevision.priceInclVat) as totalValueInclVat')
      .addSelect('sum(subTransactionRow.amount) as totalAmount')
      .where('user.extensiveDataProcessing = TRUE');

    query = this.addFilters(query, filters);
    return query;
  }

  private async getTotals(filters?: SummaryFilters): Promise<SummaryTotals> {
    const query = this.manager.createQueryBuilder()
      .select()
      .from(User, 'user')
      .innerJoin(Transaction, 'transaction', 'transaction.fromId = user.id')
      .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.transactionId = transaction.id')
      .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.subTransactionId = subTransaction.id')
      .innerJoin(ProductRevision, 'productRevision', 'productRevision.productId = subTransactionRow.productProductId AND productRevision.revision = subTransactionRow.productRevision')
      .addSelect('sum(subTransactionRow.amount * productRevision.priceInclVat) as totalInclVat')
      .addSelect('sum(subTransactionRow.amount) as amountOfProducts');

    const totals = await this.addFilters(query, filters).getRawOne();

    if (totals) return {
      totalInclVat: DineroTransformer.Instance.from(totals.totalInclVat),
      amountOfProducts: Number(totals.amountOfProducts),
    };
    return { totalInclVat: Dinero(), amountOfProducts: 0 };
  }

  public async getContainerSummary(filters?: SummaryFilters): Promise<{ summaries: ContainerSummary[], totals: SummaryTotals }> {
    const data = await this.getBaseQueryBuilder(filters)
      .groupBy('user.id, subTransaction.containerContainerId')
      .getRawAndEntities();

    const totals = await this.getTotals(filters);

    const summaries: ContainerSummary[] = data.raw.map((r): ContainerSummary => {
      const user = data.entities.find((u) => u.id === r.user_id);
      return {
        user,
        totalInclVat: DineroTransformer.Instance.from(r.totalValueInclVat),
        amountOfProducts: Number(r.totalAmount),
        containerId: r.subTransaction_containerContainerId,
      };
    });

    return {
      summaries,
      totals,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getSummary(filters?: SummaryFilters): Promise<UserSummary> {
    throw new Error('Not yet implemented');
  }
}
