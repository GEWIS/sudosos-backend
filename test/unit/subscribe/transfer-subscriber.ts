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
import { Connection } from 'typeorm';
import User from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import {
  seedContainers,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts, seedTransactions, seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import { calculateBalance } from '../../helpers/balance';
import DebtorService from '../../../src/service/debtor-service';
import { expect } from 'chai';
import { addTransfer } from '../../helpers/transaction-helpers';
import BalanceService from '../../../src/service/balance-service';
import dinero from 'dinero.js';
import Fine from '../../../src/entity/fine/fine';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';

describe('TransferSubscriber', (): void => {
  let ctx: {
    connection: Connection,
    users: User[],
    usersInDebt: User[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[];
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2021-11-30'), 10);
    const transfers = await seedTransfers(users, new Date('2020-02-12'), new Date('2021-11-30'));
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    ctx = {
      connection,
      users,
      usersInDebt: users.filter((u) => calculateBalance(u, transactions, subTransactions, transfers).amount.getAmount() < 500),
      transactions,
      subTransactions,
      transfers,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('afterInsert', () => {
    it('should set currentFines to null when debt is paid', async () => {
      const user = ctx.usersInDebt[0];
      expect(user).to.not.be.undefined;

      const debt = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(debt.getAmount()).to.be.lessThan(0);
      expect((await BalanceService.getBalance(user.id)).amount.amount).to.equal(debt.getAmount());

      const { fines } = await DebtorService.handOutFines({ userIds: [user.id], referenceDate: new Date() }, ctx.users[0]);
      const fine = await Fine.findOne({
        where: { id: fines[0].id },
        relations: ['userFineGroup'],
      });
      expect(fine.userFineGroup.userId).to.equal(user.id);
      // Sanity check

      let dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.not.be.null;
      expect(dbUser.currentFines).to.not.be.undefined;
      // Positive number to be added
      const transferAmount = debt.subtract(fine.amount).multiply(-1);
      // Sanity check
      expect((await BalanceService.getBalance(user.id)).amount.amount).to.equal(transferAmount.getAmount() * -1);

      await addTransfer(user, [], true, undefined, transferAmount.getAmount());

      const newBalance = await BalanceService.getBalance(user.id);
      expect(newBalance.amount.amount).to.equal(0);
      dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.be.null;
    });
    it('should not set currentFines to null when debt is not fully paid', async () => {
      const user = ctx.usersInDebt[1];
      expect(user).to.not.be.undefined;

      const debt = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect((await BalanceService.getBalance(user.id)).amount.amount).to.equal(debt.getAmount());

      const { fines } = await DebtorService.handOutFines({ userIds: [user.id], referenceDate: new Date() }, ctx.users[0]);
      const fine = await Fine.findOne({
        where: { id: fines[0].id },
        relations: ['userFineGroup'],
      });
      expect(fine.userFineGroup.userId).to.equal(user.id);
      // Sanity check

      let dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.not.be.null;
      expect(dbUser.currentFines).to.not.be.undefined;
      // Positive number to be added, but not enough to pay the full debt
      const transferAmount = debt.subtract(fine.amount)
        .multiply(-1)
        .subtract(dinero({ amount: 1 }));
      // Sanity check
      expect((await BalanceService.getBalance(user.id)).amount.amount).to.be.lessThan(transferAmount.getAmount() * -1);

      await addTransfer(user, [], true, undefined, transferAmount.getAmount());

      const newBalance = await BalanceService.getBalance(user.id);
      expect(newBalance.amount.amount).to.be.lessThan(0);
      dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.not.be.null;
    });
    it('should not set currentFines to null for negative transfers', async () => {
      const user = ctx.usersInDebt[2];
      expect(user).to.not.be.undefined;

      const debt = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect((await BalanceService.getBalance(user.id)).amount.amount).to.equal(debt.getAmount());

      const { fines } = await DebtorService.handOutFines({ userIds: [user.id], referenceDate: new Date() }, ctx.users[0]);
      const fine = await Fine.findOne({
        where: { id: fines[0].id },
        relations: ['userFineGroup'],
      });
      expect(fine.userFineGroup.userId).to.equal(user.id);
      // Sanity check

      let dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.not.be.null;
      expect(dbUser.currentFines).to.not.be.undefined;
      // Positive number to be added, but not enough to pay the full debt
      const transferAmount = debt.subtract(fine.amount);
      // Sanity check
      expect((await BalanceService.getBalance(user.id)).amount.amount).to.equal(transferAmount.getAmount());

      await addTransfer(user, [], false, undefined, transferAmount.getAmount());

      const newBalance = await BalanceService.getBalance(user.id);
      expect(newBalance.amount.amount).to.be.greaterThanOrEqual(0);
      dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.not.be.null;
    });
  });
});
