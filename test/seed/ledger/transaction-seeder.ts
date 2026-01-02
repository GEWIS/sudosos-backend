/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import WithManager from '../../../src/database/with-manager';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import User from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
import { getRandomDate } from '../helpers';
import { PointOfSaleSeeder } from '../catalogue';

export default class TransactionSeeder extends WithManager {
  /**
   * Defines transaction objects subtransactions and rows based on the parameters passed.
   * A deterministic subset of the containers and products will be used for every transaction.
   *
   * @param start - The number of transactions that already exist.
   * @param startSubTransaction - The number of subtransactions that already exist.
   * @param startRow - The number of subtransaction rows that already exist.
   * @param count - The number of transactions to generate.
   * @param pointOfSale - The point of sale for which to generate transactions.
   * @param from - The user that buys stuff from the point of sale.
   * @param createdBy - The user that has created the transaction for the 'from' user, or null.
   * @param createdAt - Date of transaction creation
   */
  private defineTransactions(
    start: number,
    startSubTransaction: number,
    startRow: number,
    count: number,
    pointOfSale: PointOfSaleRevision,
    from: User,
    createdBy: User,
    createdAt?: Date,
  ): Transaction[] {
    const transactions: Transaction[] = [];
    let subTransactionId = startSubTransaction;
    let rowId = startRow;

    for (let nr = 1; nr <= count; nr += 1) {
      const transaction = Object.assign(new Transaction(), {
        id: start + nr,
        createdAt,
        from,
        createdBy,
        pointOfSale,
        subTransactions: [],
      }) as Transaction;
      transactions.push(transaction);

      for (let c = 0; c < pointOfSale.containers.length; c += 1) {
        const container = pointOfSale.containers[c];

        // Only define some of the containers.
        if ((start + 5 * c + 13 * nr) % 3 === 0) {
          subTransactionId += 1;
          const subTransaction = Object.assign(new SubTransaction(), {
            id: subTransactionId,
            createdAt,
            to: pointOfSale.pointOfSale.owner,
            transaction,
            container,
            subTransactionRows: [],
          });
          transaction.subTransactions.push(subTransaction);

          for (let p = 0; p < container.products.length; p += 1) {
            // Only define some of the products.
            if ((3 * start + 7 * c + 17 * nr + p * 19) % 5 === 0) {
              rowId += 1;
              const row = Object.assign(new SubTransactionRow(), {
                id: rowId,
                createdAt,
                subTransaction,
                product: container.products[p],
                amount: ((start + c + p + nr) % 3) + 1,
              });
              subTransaction.subTransactionRows.push(row);
            }
          }
        }
      }
    }

    return transactions;
  }

  /**
   * Seeds a default dataset of transactions, based on the supplied user and point of sale
   * revision dataset. Every point of sale revision will recevie transactions.
   *
   * @param users - The dataset of users to base the point of sale dataset on.
   * @param pointOfSaleRevisions
   *  - The dataset of point of sale revisions to base the transaction dataset on.
   * @param beginDate - The lower bound for the range of transaction creation dates
   * @param endDate - The upper bound for the range of transaction creation dates
   * @param nrMultiplier - Multiplier for the number of transactions to create
   */
  public async seed(
    users: User[],
    pointOfSaleRevisions?: PointOfSaleRevision[],
    beginDate?: Date,
    endDate?: Date,
    nrMultiplier: number = 1,
  ): Promise<{
      transactions: Transaction[],
      subTransactions: SubTransaction[],
    }> {
    let pointOfSaleRevisions1 = pointOfSaleRevisions ?? (await new PointOfSaleSeeder().seed(users)).pointOfSaleRevisions;

    let transactions: Transaction[] = [];
    let startSubTransaction = 0;
    let startRow = 0;

    for (let i = 0; i < pointOfSaleRevisions1.length; i += 1) {
      const pos = pointOfSaleRevisions1[i];

      const from = users[(i + pos.pointOfSale.id * 5 + pos.revision * 7) % users.length];
      const createdBy = (i + pos.revision) % 3 !== 0
        ? from
        : users[(i * 5 + pos.pointOfSale.id * 7 + pos.revision) % users.length];
      let createdAt: Date;
      if (beginDate && endDate) createdAt = getRandomDate(beginDate, endDate, i);
      const trans = this.defineTransactions(
        transactions.length,
        startSubTransaction,
        startRow,
        Math.round(2 * nrMultiplier),
        pos,
        from,
        createdBy,
        createdAt,
      );

      // Update the start id counters.
      for (let a = 0; a < trans.length; a += 1) {
        const t = trans[a];
        startSubTransaction += t.subTransactions.length;
        for (let b = 0; b < t.subTransactions.length; b += 1) {
          const s = t.subTransactions[b];
          startRow += s.subTransactionRows.length;
        }
      }

      // First, save all transactions.
      await this.manager.save(Transaction, trans)
        .then(async () => {
          // Then, save all subtransactions for the transactions.
          // const subPromises: Promise<any>[] = [];
          for (let j = trans.length - 1; j >= 0; j--) {
            await this.manager.save(SubTransaction, trans[j].subTransactions);
          }
        }).then(async () => {
          // Then, save all subtransactions rows for the subtransactions.
          for (let j = trans.length - 1; j >= 0; j--) {
            for (let k = trans[j].subTransactions.length - 1; k >= 0; k--) {
              await this.manager.save(SubTransactionRow, trans[j].subTransactions[k].subTransactionRows);
            }
          }
        });

      transactions = transactions.concat(trans);

    }
    return {
      transactions,
      subTransactions: transactions.map((t) => t.subTransactions).flat(),
    };
  }
}
