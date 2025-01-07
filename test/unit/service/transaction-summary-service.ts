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
import { defaultBefore, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import { ContainerSeeder, PointOfSaleSeeder, TransactionSeeder, UserSeeder } from '../../seed';
import Container from '../../../src/entity/container/container';
import User from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import TransactionSummaryService from '../../../src/service/transaction-summary-service';
import Dinero from 'dinero.js';
import { expect } from 'chai';

describe('TransactionSummaryService', () => {
  let ctx: DefaultContext & {
    users: User[],
    containers: Container[],
    transactions: Transaction[],
  };

  before(async () => {
    const d = await defaultBefore();

    const users = await new UserSeeder().seed();
    const { containers, containerRevisions } = await new ContainerSeeder().seed(users);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions);

    ctx = {
      ...d,
      users,
      containers,
      transactions,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#getContainerSummary', () => {
    const calculateActualValues = (user: User, containerId: number) => {
      const transactions = ctx.transactions.filter((t) => t.from.id === user.id
          && t.subTransactions.some((st) => st.container.containerId === containerId));
      const subTransactions = transactions.map((t) => t.subTransactions)
        .flat()
        .filter((subTransaction) => subTransaction?.container.containerId === containerId);
      const subTransactionRows = subTransactions.map((st) => st.subTransactionRows).flat();

      const amountOfProducts = subTransactionRows.reduce((total, str) => total + str.amount, 0);
      const totalInclVat = subTransactionRows.reduce((total, str) => total.add(str.product.priceInclVat.multiply(str.amount)), Dinero());

      return { amountOfProducts, totalInclVat };
    };

    it('should return the summary of all user\'s purchases for each container', async () => {
      const summaries = await new TransactionSummaryService().getContainerSummary();
      const seenUserIds = new Set<number>();

      let actualTotalValue = Dinero();

      summaries.forEach((summary) => {
        seenUserIds.add(summary.user.id);
        const expectedUser = ctx.users.find((u) => u.id === summary.user.id);
        expect(expectedUser).to.not.be.undefined;
        expect(expectedUser.firstName).to.equal(summary.user.firstName);
        expect(expectedUser.lastName).to.equal(summary.user.lastName);

        const { amountOfProducts, totalInclVat } = calculateActualValues(summary.user, summary.containerId);
        expect(summary.amountOfProducts).to.equal(amountOfProducts);
        expect(summary.totalInclVat.getAmount()).to.equal(totalInclVat.getAmount());

        actualTotalValue = actualTotalValue.add(summary.totalInclVat);
      });

      const expectedTotalValue = ctx.transactions.reduce((totalTransaction, t) => {
        const subTransactionValue = t.subTransactions.reduce((totalSubTransaction, st) => {
          const subTransactionRowValue = st.subTransactionRows.reduce((totalSubTransactionRow, str) => {
            return totalSubTransactionRow.add(str.product.priceInclVat.multiply(str.amount));
          }, Dinero());
          return totalSubTransaction.add(subTransactionRowValue);
        }, Dinero());
        return totalTransaction.add(subTransactionValue);
      }, Dinero());

      // Sum of all summaries should add up to the complete sum of all transactions
      expect(actualTotalValue.getAmount()).to.equal(expectedTotalValue.getAmount());

      const missingUsers = ctx.users.filter((u) => !seenUserIds.has(u.id));
      // If an user is missing, it should be because the user has no (or incorrect) transactions
      if (missingUsers.length > 0) {
        missingUsers.forEach((u) => {
          const transactions = ctx.transactions.filter((t) => t.from.id === u.id);
          if (transactions.length > 0) {
            const subTransactions = transactions.map((t) => t.subTransactions).flat();
            if (subTransactions.length > 0) {
              const subTransactionRows = subTransactions.map((st) => st.subTransactionRows).flat();
              // Should have no valid transactions. Otherwise, this user was not included!
              expect(subTransactionRows.length).to.equal(0);
            }
          }
        });
      }
    });

    it('should filter on container ID', async () => {
      const container = ctx.containers[0];
      const summaries = await new TransactionSummaryService().getContainerSummary({ containerId: container.id });

      let actualTotalValue = Dinero();

      summaries.forEach((summary) => {
        expect(summary.containerId).to.equal(container.id);
        actualTotalValue = actualTotalValue.add(summary.totalInclVat);
      });

      const expectedTotalValue = ctx.transactions.reduce((totalTransaction, t) => {
        const subTransactionValue = t.subTransactions.reduce((totalSubTransaction, st) => {
          if (st.container.containerId !== container.id) return totalSubTransaction;
          const subTransactionRowValue = st.subTransactionRows.reduce((totalSubTransactionRow, str) => {
            return totalSubTransactionRow.add(str.product.priceInclVat.multiply(str.amount));
          }, Dinero());
          return totalSubTransaction.add(subTransactionRowValue);
        }, Dinero());
        return totalTransaction.add(subTransactionValue);
      }, Dinero());

      // Sum of all summaries should add up to the complete sum of all transactions using this container
      expect(actualTotalValue.getAmount()).to.equal(expectedTotalValue.getAmount());
    });
  });
});
