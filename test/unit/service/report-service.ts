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
import { defaultBefore, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { createTransactions } from '../../helpers/transaction-factory';
import User from '../../../src/entity/user/user';
import { BuyerReportService, ReportParameters, SalesReportService } from '../../../src/service/report-service';
import { expect } from 'chai';
import {
  seedContainers,
  seedPointsOfSale,
  seedTransactions,
} from '../../seed-legacy';
import TransactionService from '../../../src/service/transaction-service';
import { Report } from '../../../src/entity/report/report';
import { ProductSeeder, UserSeeder } from '../../seed';

describe('ReportService', () => {
  let ctx: any & DefaultContext;

  let EMPTY_TRANSACTIONS: { tId: number, amount: number }[] = [];

  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    } as any;

    const users = await new UserSeeder().seedUsers();
    const { productRevisions } = await new ProductSeeder().seedProducts(users);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions);

    ctx = {
      ...ctx,
      users,
      transactions,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  /**
   * Checks if the report agrees with itself.
   * i.e. all the totals are the same across all categories.
   */
  function checkReport<T extends Report>(report: T) {
    // Check products
    if (report.data.products) {
      let sumExclVat = 0;
      let sumInclVat = 0;
      report.data.products.forEach((entry) => {
        sumExclVat += entry.totalExclVat.getAmount();
        sumInclVat += entry.totalInclVat.getAmount();
        expect(entry.totalExclVat.getAmount()).to.eq(entry.count * Math.round(entry.product.priceInclVat.getAmount() / (1 + (entry.product.vat.percentage / 100))));
        expect(entry.totalInclVat.getAmount()).to.equal(entry.product.priceInclVat.getAmount() * entry.count);
      });
      expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
      expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
    }
    // Check categories
    if (report.data.categories) {
      let sumExclVat = 0;
      let sumInclVat = 0;
      report.data.categories.forEach((entry) => {
        sumExclVat += entry.totalExclVat.getAmount();
        sumInclVat += entry.totalInclVat.getAmount();
      });
      expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
      expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
    }
    // Check POS
    if (report.data.pos) {
      let sumExclVat = 0;
      let sumInclVat = 0;
      report.data.pos.forEach((entry) => {
        sumExclVat += entry.totalExclVat.getAmount();
        sumInclVat += entry.totalInclVat.getAmount();
      });
      expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
      expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
    }
    // Check containers
    if (report.data.containers) {
      let sumExclVat = 0;
      let sumInclVat = 0;
      report.data.containers.forEach((entry) => {
        sumExclVat += entry.totalExclVat.getAmount();
        sumInclVat += entry.totalInclVat.getAmount();
      });
      expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
      expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
    }
    // Check VAT
    if (report.data.vat) {
      let sumExclVat = 0;
      let sumInclVat = 0;
      report.data.vat.forEach((entry) => {
        sumExclVat += entry.totalExclVat.getAmount();
        sumInclVat += entry.totalInclVat.getAmount();
      });
      expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
      expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
    }
  }

  async function checkTransactionsSalesReport(transactions: { tId: number, amount: number }[], parameters: ReportParameters) {
    const report = await new SalesReportService().getReport(parameters);
    const totalInclVat = transactions.reduce((sum, t) => sum + t.amount, 0);
    expect(report.totalInclVat.getAmount()).to.eq(totalInclVat);
    checkReport(report);
  }

  async function checkTransactionsBuyerReport(transactions: { tId: number, amount: number }[], parameters: ReportParameters) {
    const report = await new BuyerReportService().getReport(parameters);
    const totalInclVat = transactions.reduce((sum, t) => sum + t.amount, 0);
    expect(report.totalInclVat.getAmount()).to.eq(totalInclVat);
    checkReport(report);
  }

  async function createMultipleBuyersSingleSeller(buyerCount: number, tester: (users: User[], transactions: { tId: number, amount: number }[]) => Promise<void>) {
    return inUserContext((await UserFactory()).clone(buyerCount + 1), async (...users: User[]) => {
      const [seller, ...buyers] = users;
      const transactions = [];
      for (let buyer of buyers) {
        transactions.push(...(await createTransactions(buyer.id, seller.id, 3)).transactions);
      }
      await tester([seller, ...buyers], transactions);
    });
  }

  describe('SalesReportService', () => {
    it('should return the total income of a user', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transaction = (await createTransactions(debtor.id, creditor.id, 1)).transactions[0];
        const parameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: creditor.id,
        };
        const t = await new TransactionService().getSingleTransaction(transaction.tId);

        const report = await new SalesReportService().getReport(parameters);
        expect(report.totalInclVat.getAmount()).to.eq(t.totalPriceInclVat.amount);
        checkReport(report);
      });
    });

    it('should return the total income of a user with multiple transactions', async () => {
      await inUserContext((await UserFactory()).clone(3), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        await checkTransactionsSalesReport(transactions.transactions, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: creditor.id,
        });
      });
    });

    it('should return an empty report when there are no transactions', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await checkTransactionsSalesReport(EMPTY_TRANSACTIONS, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: creditor.id,
        });
      });
    });

    it('should return the correct total income for multiple buyers buying from the same seller', async () => {
      await createMultipleBuyersSingleSeller(3, async (users, transactions) => {
        const [seller] = users;
        await checkTransactionsSalesReport(transactions, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: seller.id,
        });
      });
    });

    describe('fromDate filter', () => {
      it('should return the total income of a user with a transactions in the past', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const transactions = await createTransactions(debtor.id, creditor.id, 3, -5000);
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate: new Date(2050, 0, 0),
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user with transactions right before the fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const fromDate = new Date(new Date().getTime() - 1000);
          await createTransactions(debtor.id, creditor.id, 3, -3000);
          await checkTransactionsSalesReport(EMPTY_TRANSACTIONS, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user with transactions right after the fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const fromDate = new Date(new Date().getTime() - 2000);
          const transactions = await createTransactions(debtor.id, creditor.id, 3, -1000);
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user with mixed transactions before and after the fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          await createTransactions(debtor.id, creditor.id, 2, -4000);  // Before fromDate
          const fromDate = new Date(new Date().getTime() - 1000);
          const transactions = await createTransactions(debtor.id, creditor.id, 3); // After fromDate
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: creditor.id,
          });
        });
      });
      it('should return the total income of a user from the exact fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const fromDate = new Date(new Date().getTime() - 1000);
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: creditor.id,
          });
        });
      });
    });

    describe('tillDate filter', () => {
      it('should return the total income of a user with transactions before the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 1000);
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user with transactions right after the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 1000);
          await createTransactions(debtor.id, creditor.id, 3, 2000);
          await checkTransactionsSalesReport(EMPTY_TRANSACTIONS, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user with transactions right before the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 2000);
          const transactions = await createTransactions(debtor.id, creditor.id, 3, 1000);
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user with mixed transactions before and after the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const transactions = await createTransactions(debtor.id, creditor.id, 3); // Before tillDate
          const tillDate = new Date(new Date().getTime() + 2000);
          await createTransactions(debtor.id, creditor.id, 2, 4000);  // After tillDate
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: creditor.id,
          });
        });
      });

      it('should return the total income of a user till the exact tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 1000);
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          await checkTransactionsSalesReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: creditor.id,
          });
        });
      });
    });

    it('should adhere to both fromDate and tillDate filters', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createTransactions(debtor.id, creditor.id, 2, -5000);
        const fromDate = new Date(new Date().getTime() - 4000);
        const transactionsWithin = await createTransactions(debtor.id, creditor.id, 3, -3000);  // Within range
        const tillDate = new Date(new Date().getTime() - 1000);
        await createTransactions(debtor.id, creditor.id, 2); // After tillDate

        await checkTransactionsSalesReport(transactionsWithin.transactions, {
          fromDate,
          tillDate,
          forId: creditor.id,
        });
      });
    });

    it('should correctly aggregate transactions from multiple buyers to the same seller', async () => {
      await createMultipleBuyersSingleSeller(3, async (users, transactions) => {
        const [seller] = users;
        await checkTransactionsSalesReport(transactions, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: seller.id,
        });
      });
    });
  });

  describe('BuyerReportService', () => {
    it('should return the total expenditure of a user', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transaction = (await createTransactions(debtor.id, creditor.id, 1)).transactions[0];
        const parameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: debtor.id,
        };
        const t = await new TransactionService().getSingleTransaction(transaction.tId);

        const report = await new BuyerReportService().getReport(parameters);
        expect(report.totalInclVat.getAmount()).to.eq(t.totalPriceInclVat.amount);
        checkReport(report);
      });
    });

    it('should return the total expenditure of a user with multiple transactions', async () => {
      await inUserContext((await UserFactory()).clone(3), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        await checkTransactionsBuyerReport(transactions.transactions, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: debtor.id,
        });
      });
    });

    it('should return an empty report when there are no transactions', async () => {
      await inUserContext((await UserFactory()).clone(1), async (debtor: User) => {
        await checkTransactionsBuyerReport(EMPTY_TRANSACTIONS, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: debtor.id,
        });
      });
    });

    describe('fromDate filter', () => {
      it('should return the total expenditure of a user with a transactions in the past', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const transactions = await createTransactions(debtor.id, creditor.id, 3, -5000); // Transactions in the past
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate: new Date(2050, 0, 0),
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user with transactions right before the fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const fromDate = new Date(new Date().getTime() - 1000); // Set fromDate to 1 second before current time
          await createTransactions(debtor.id, creditor.id, 3, -3000); // Transactions 3 seconds in the past
          await checkTransactionsBuyerReport([{ tId: 0, amount: 0 }], {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user with transactions right after the fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const fromDate = new Date(new Date().getTime() - 2000); // Set fromDate to 2 seconds before current time
          const transactions = await createTransactions(debtor.id, creditor.id, 3, -1000); // Transactions 1 second in the past
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user with mixed transactions before and after the fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          await createTransactions(debtor.id, creditor.id, 2, -2000);  // (before fromDate)
          const fromDate = new Date(new Date().getTime());
          const transactions = await createTransactions(debtor.id, creditor.id, 3, 2000); // (after fromDate)
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user from the exact fromDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const fromDate = new Date(new Date().getTime() - 1000); // Set fromDate to 1 second before current time
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate,
            tillDate: new Date(2050, 0, 0),
            forId: debtor.id,
          });
        });
      });
    });

    describe('tillDate filter', () => {
      it('should return the total expenditure of a user with transactions before the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 1000); // Set tillDate to 1 second after current time
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user with transactions right after the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 1000); // Set tillDate to 1 second after current time
          await createTransactions(debtor.id, creditor.id, 3, 2000); // Transactions 2 seconds in the future
          await checkTransactionsBuyerReport([{ tId: 0, amount: 0 }], {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user with transactions right before the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 2000); // Set tillDate to 2 seconds after current time
          const transactions = await createTransactions(debtor.id, creditor.id, 3, 1000); // Transactions 1 second in the future
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user with mixed transactions before and after the tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          const tillDate = new Date();
          await createTransactions(debtor.id, creditor.id, 2, 2000);
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: debtor.id,
          });
        });
      });

      it('should return the total expenditure of a user till the exact tillDate', async () => {
        await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
          const tillDate = new Date(new Date().getTime() + 1000); // Set tillDate to 1 second after current time
          const transactions = await createTransactions(debtor.id, creditor.id, 3);
          await checkTransactionsBuyerReport(transactions.transactions, {
            fromDate: new Date(2000, 0, 0),
            tillDate,
            forId: debtor.id,
          });
        });
      });
    });

    it('should adhere to both fromDate and tillDate filters', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createTransactions(debtor.id, creditor.id, 2, -5000);
        const fromDate = new Date(new Date().getTime() - 4000);
        const transactionsWithin = await createTransactions(debtor.id, creditor.id, 3, -3000);
        const tillDate = new Date(new Date().getTime() - 1000);
        await createTransactions(debtor.id, creditor.id, 2);

        await checkTransactionsBuyerReport(transactionsWithin.transactions, {
          fromDate,
          tillDate,
          forId: debtor.id,
        });
      });
    });

    it('should correctly aggregate transactions from multiple sellers by the same buyer', async () => {
      await inUserContext((await UserFactory()).clone(4), async (debtor: User, ...creditors: User[]) => {
        const transactions: { tId: number, amount: number }[] = [];
        const promises = creditors.map(async (creditor) => {
          return createTransactions(debtor.id, creditor.id, 2).then((t) => {
            transactions.push(...t.transactions);
          });
        });

        await Promise.all(promises);

        await checkTransactionsBuyerReport(transactions, {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          forId: debtor.id,
        });
      });
    });
  });
});
