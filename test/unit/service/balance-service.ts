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

import { expect } from 'chai';
import { DataSource, DeepPartial } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import BalanceService, { BalanceOrderColumn } from '../../../src/service/balance-service';
import User, { UserType } from '../../../src/entity/user/user';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Balance from '../../../src/entity/transactions/balance';
import { UserFactory } from '../../helpers/user-factory';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { OrderingDirection } from '../../../src/helpers/ordering';
import { defaultPagination } from '../../../src/helpers/pagination';
import { addTransaction, addTransfer } from '../../helpers/transaction-helpers';
import { calculateBalance } from '../../helpers/balance';
import Fine from '../../../src/entity/fine/fine';
import BalanceResponse, { UserTypeTotalBalanceResponse } from '../../../src/controller/response/balance-response';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { FineSeeder, PointOfSaleSeeder, TransactionSeeder, TransferSeeder, UserSeeder } from '../../seed';

describe('BalanceService', (): void => {
  let ctx: {
    connection: DataSource,
    users: User[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
    fines: Fine[],
    spec: SwaggerSpecification,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const seededUsers = await new UserSeeder().seed();
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(seededUsers);
    const { transactions } = await new TransactionSeeder().seed(seededUsers, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2021-11-30'), 10);
    const transfers = await new TransferSeeder().seed(seededUsers, new Date('2020-02-12'), new Date('2021-11-30'));
    const { fines, fineTransfers, users } = await new FineSeeder().seed(seededUsers, transactions, transfers, true, true);
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    ctx = {
      connection,
      users: [...users.filter((u) => !u.deleted)],
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers: transfers.concat(fineTransfers),
      fines,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  function checkFine(balance: BalanceResponse, user: User) {
    if (user.currentFines == null) {
      expect(balance.fine).to.be.null;
      expect(balance.fineSince).to.be.null;
      expect(balance.nrFines).to.equal(0);
      return;
    }

    // Sanity check, user should have negative balance (otherwise they cannot have an unpaid fine)
    expect(balance.amount.amount).to.be.lessThan(0);

    expect(balance.fine).to.not.be.null;
    const { fines } = user.currentFines;
    const fineAmount = fines.reduce((sum, fine) => sum + fine.amount.getAmount(), 0);
    expect(balance.fine.amount).to.equal(fineAmount);
    expect(balance.nrFines).to.equal(fines.length);
    expect(new Date(balance.fineSince).getTime()).to.equal(user.currentFines.createdAt.getTime());

    if (user.currentFines.waivedTransfer == null) {
      expect(balance.fineWaived).to.be.null;
    } else {
      expect(balance.fineWaived).to.not.be.null;
      expect(balance.fineWaived).to.not.be.undefined;
      expect(balance.fineWaived.amount).to.equal(user.currentFines.waivedTransfer.amountInclVat.getAmount());
    }
  }

  describe('getBalances', () => {
    it('should return balances from all users', async () => {
      const balanceResponses = await new BalanceService().getBalances({});
      const now = new Date();
      expect(balanceResponses.records.length).to.equal(ctx.users.length);

      balanceResponses.records.forEach((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        expect(user).to.not.be.undefined;
        const actualBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers);
        expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());
        expect(now.getTime() - new Date(balance.date).getTime()).to.be.at.most(1000);
        checkFine(balance, user);
      });

      expect(balanceResponses.records.some((b) => b.fine), 'At least one user has a fine').to.be.true;
    });
    it('should return balances on certain date', async () => {
      const date = new Date('2021-01-01');
      const balances = await new BalanceService().getBalances({ date });

      balances.records.forEach((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        expect(user).to.not.be.undefined;
        const actualBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, date);
        expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());
        expect(balance.date).to.equal(date.toISOString());
        checkFine(balance, user);
      });
    });
    it('should return balance from subset of users', async () => {
      const users = [ctx.users[10], ctx.users[11], ctx.users[12]];
      const balanceResponses = await new BalanceService().getBalances({ ids: users.map((u) => u.id) });
      expect(balanceResponses.records.length).to.equal(users.length);

      balanceResponses.records.map((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        const actualBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers);
        expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());
        checkFine(balance, user);
      });
    });
    it('should only return balances more than or equal a certain amount', async () => {
      const amount = 1039;
      const allResponses = await new BalanceService().getBalances({});
      const filteredResponses = await new BalanceService().getBalances({
        minBalance: DineroTransformer.Instance.from(amount),
      });

      expect(filteredResponses.records.length).to.equal(allResponses.records.filter((res) => res.amount.amount >= amount).length);
      filteredResponses.records.forEach((res) => expect(res.amount.amount).to.be.greaterThanOrEqual(amount));
    });
    it('should only return balances less than or equal a certain amount', async () => {
      const amount = 1039;
      const allResponses = await new BalanceService().getBalances({});
      const filteredResponses = await new BalanceService().getBalances({
        maxBalance: DineroTransformer.Instance.from(amount),
      });

      expect(filteredResponses.records.length).to.equal(allResponses.records.filter((res) => res.amount.amount <= amount).length);
      filteredResponses.records.forEach((res) => expect(res.amount.amount).to.be.lessThanOrEqual(amount));
    });
    it('should only return balances without a fine', async () => {
      const users = ctx.users.filter((u) => u.currentFines == null);
      const balances = await new BalanceService().getBalances({ hasFine: false });

      expect(balances.records.length).to.equal(users.length);
      balances.records.forEach((b) => b.fine == null && b.fineSince == null);
    });
    it('should only return balances with a fine', async () => {
      const users = ctx.users.filter((u) => u.currentFines != null);
      const balances = await new BalanceService().getBalances({ hasFine: true });

      expect(balances.records.length).to.equal(users.length);
      balances.records.forEach((b) => b.fine != null && b.fineSince != null);
    });
    it('should only return balances starting with a certain fine amount', async () => {
      const amount = 600;
      const users = ctx.users.filter((u) => u.currentFines != null)
        .filter((u) => u.currentFines.fines.reduce((sum, f) => sum + f.amount.getAmount(), 0) >= amount);
      const balances = await new BalanceService().getBalances({
        minFine: DineroTransformer.Instance.from(amount),
      });

      expect(balances.records.length).to.equal(users.length);
      balances.records.forEach((b) => b.fine != null && b.fine.amount >= amount);
    });
    /**
     * See https://github.com/GEWIS/sudosos-backend/issues/167
     */
    it('should not return deleted users', async () => {
      const user = ctx.users[0];
      const balance = await new BalanceService().getBalances({ ids: [user.id] });
      expect(balance.records).to.not.be.empty;

      await User.update(user.id, { deleted: true });
      const balance2 = await new BalanceService().getBalances({ ids: [user.id] });
      expect(balance2.records).to.be.empty;
    });
    it('should include transactions from deleted POS', async () => {
      const builder = await UserFactory();
      const user = await builder.get();

      const deletedPos = ctx.pointOfSaleRevisions.find((p) => p.pointOfSale.deletedAt != null);
      const container = deletedPos.containers[0];
      const product = container.products[0];
      const totalPriceInclVat = product.priceInclVat.toObject();

      const transaction = await Transaction.save({
        from: user,
        createdBy: user,
        pointOfSale: deletedPos,
      } as DeepPartial<Transaction>);
      const subTransaction = await SubTransaction.save({
        to: container.container.owner,
        transaction,
        container,
      } as DeepPartial<SubTransaction>);
      const subTransactionRow = await SubTransactionRow.save({
        product,
        amount: 1,
        subTransaction,
      } as DeepPartial<SubTransactionRow>);

      const balance = await new BalanceService().getBalance(user.id);
      expect(balance.amount.amount).to.equal(totalPriceInclVat.amount * -1);

      // Cleanup
      await Transaction.delete(transaction.id);
      await SubTransaction.delete(subTransaction.id);
      await SubTransactionRow.delete(subTransactionRow.id);
      await builder.delete();
    });
    it('should include transactions with deleted container', async () => {
      const builder = await UserFactory();
      const user = await builder.get();

      const deletedPos = ctx.pointOfSaleRevisions.find((p) => p.containers.some((c) => c.container.deletedAt != null));
      const container = deletedPos.containers.find((c) => c.container.deletedAt != null);
      const product = container.products[0];
      const totalPriceInclVat = product.priceInclVat.toObject();

      const transaction = await Transaction.save({
        from: user,
        createdBy: user,
        pointOfSale: deletedPos,
      } as DeepPartial<Transaction>);
      const subTransaction = await SubTransaction.save({
        to: container.container.owner,
        transaction,
        container,
      } as DeepPartial<SubTransaction>);
      const subTransactionRow = await SubTransactionRow.save({
        product,
        amount: 1,
        subTransaction,
      } as DeepPartial<SubTransactionRow>);

      const balance = await new BalanceService().getBalance(user.id);
      expect(balance.amount.amount).to.equal(totalPriceInclVat.amount * -1);

      // Cleanup
      await Transaction.delete(transaction.id);
      await SubTransaction.delete(subTransaction.id);
      await SubTransactionRow.delete(subTransactionRow.id);
      await builder.delete();
    });
    it('should include transactions with deleted products', async () => {
      const builder = await UserFactory();
      const user = await builder.get();

      const deletedPos = ctx.pointOfSaleRevisions.find((p) => p.containers.some((c) => c.products.some((pr) => pr.product.deletedAt != null)));
      const container = deletedPos.containers.find((c) => c.products.some((p) => p.product.deletedAt != null));
      const product = container.products.find((p) => p.product.deletedAt != null);
      const totalPriceInclVat = product.priceInclVat.toObject();

      const transaction = await Transaction.save({
        from: user,
        createdBy: user,
        pointOfSale: deletedPos,
      } as DeepPartial<Transaction>);
      const subTransaction = await SubTransaction.save({
        to: container.container.owner,
        transaction,
        container,
      } as DeepPartial<SubTransaction>);
      const subTransactionRow = await SubTransactionRow.save({
        product,
        amount: 1,
        subTransaction,
      } as DeepPartial<SubTransactionRow>);

      const balance = await new BalanceService().getBalance(user.id);
      expect(balance.amount.amount).to.equal(totalPriceInclVat.amount * -1);

      // Cleanup
      await Transaction.delete(transaction.id);
      await SubTransaction.delete(subTransaction.id);
      await SubTransactionRow.delete(subTransactionRow.id);
      await builder.delete();
    });
    it('should only return balances with at most a certain fine amount', async () => {
      const amount = 600;
      const users = ctx.users.filter((u) => u.currentFines != null)
        .filter((u) => u.currentFines.fines.reduce((sum, f) => sum + f.amount.getAmount(), 0) <= amount);
      const balances = await new BalanceService().getBalances({
        maxFine: DineroTransformer.Instance.from(amount),
      });

      expect(balances.records.length).to.equal(users.length);
      balances.records.forEach((b) => b.fine != null && b.fine.amount <= amount);
    });
    it('should return all users with certain user type', async () => {
      const type = UserType.LOCAL_USER;
      const users = ctx.users.filter((u) => u.type === type);
      const balances = await new BalanceService().getBalances({ userTypes: [type], allowDeleted: true });

      expect(balances.records.length).to.equal(users.length);

      const userIds = users.map((u) => u.id);
      balances.records.forEach((bal) => {
        expect(userIds).to.include(bal.id);
      });

      const balanceIds = balances.records.map((b) => b.id);
      users.forEach((u) => {
        expect(balanceIds).to.include(u.id);
      });
    });
    it('should return all inactive users', async () => {
      const users = ctx.users.filter((u) => u.active === false);
      const balances = await new BalanceService().getBalances({ inactive: true });
      expect(balances.records.length).to.be.greaterThan(0);
      expect(balances.records.length).to.equal(users.length);

      const userIds = users.map((u) => u.id);
      balances.records.forEach((bal) => {
        expect(userIds).to.include(bal.id);
      });
    });
    it('should return all users with certain user type from set of types', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.LOCAL_ADMIN];
      const users = ctx.users.filter((u) => userTypes.includes(u.type));
      const balances = await new BalanceService().getBalances({ userTypes, allowDeleted: true });

      expect(balances.records.length).to.equal(users.length);

      const userIds = users.map((u) => u.id);
      balances.records.forEach((bal) => {
        expect(userIds).to.include(bal.id);
      });

      const balanceIds = balances.records.map((b) => b.id);
      users.forEach((u) => {
        expect(balanceIds).to.include(u.id);
      });
    });
    it('should return balances ordered by ID desc', async () => {
      const balanceResponses = await new BalanceService().getBalances({
        orderBy: BalanceOrderColumn.ID, orderDirection: OrderingDirection.DESC,
      });

      balanceResponses.records.forEach((response, index, responses) => {
        if (index === 0) return;
        expect(response.id).to.be.lessThan(responses[index - 1].id);
      });
    });
    it('should return balances ordered by amount asc', async () => {
      const balanceResponses = await new BalanceService().getBalances({
        orderBy: BalanceOrderColumn.AMOUNT, orderDirection: OrderingDirection.ASC,
      });

      balanceResponses.records.forEach((response, index, responses) => {
        if (index === 0) return;
        expect(response.amount.amount).to.be.greaterThanOrEqual(responses[index - 1].amount.amount);
      });
    });
    it('should return balances ordered by fine amount asc', async () => {
      const balanceResponses = await new BalanceService().getBalances({
        orderBy: BalanceOrderColumn.FINEAMOUNT, orderDirection: OrderingDirection.ASC, hasFine: true,
      });
      balanceResponses.records.forEach((response, index, responses) => {
        if (index === 0) return;
        expect(response.fine.amount).to.be.greaterThanOrEqual(responses[index - 1].fine.amount);
      });
    });
    it('should return balances ordered by fine date asc', async () => {
      const balanceResponses = await new BalanceService().getBalances({
        orderBy: BalanceOrderColumn.FINESINCE, orderDirection: OrderingDirection.ASC,
      });
      balanceResponses.records.forEach((response, index, responses) => {
        if (index === 0) return;
        expect(new Date(response.fineSince).getTime()).to.be.greaterThanOrEqual(new Date(responses[index - 1].fineSince).getTime());
      });
    });
    it('should return balances ordered ascending by default', async () => {
      const balanceResponses = await new BalanceService().getBalances({
        orderBy: BalanceOrderColumn.AMOUNT,
      });

      balanceResponses.records.forEach((response, index, responses) => {
        if (index === 0) return;
        expect(response.amount.amount).to.be.greaterThanOrEqual(responses[index - 1].amount.amount);
      });
    });
    it('should set pagination metadata correctly when pagination parameters are undefined', async () => {
      const balanceResponses = await new BalanceService().getBalances({}, {});
      expect(balanceResponses._pagination.take).to.be.undefined;
      expect(balanceResponses._pagination.skip).to.be.undefined;
      expect(balanceResponses._pagination.count).to.equal(balanceResponses.records.length);
    });
    it('should adhere to pagination take', async () => {
      const take = 10;
      const balanceResponses = await new BalanceService().getBalances({ allowDeleted: true }, { take });
      expect(balanceResponses.records.length).to.equal(take);
      expect(balanceResponses._pagination.take).to.equal(take);
      expect(balanceResponses._pagination.skip).to.be.undefined;
      expect(balanceResponses._pagination.count).to.equal(ctx.users.length);
    });
    it('should adhere to pagination skip', async () => {
      const take = 4;
      const skip = ctx.users.length - take;
      const balanceResponses = await new BalanceService().getBalances({ allowDeleted: true }, { skip });
      expect(balanceResponses.records.length).to.equal(take);
      expect(balanceResponses._pagination.take).to.equal(defaultPagination());
      expect(balanceResponses._pagination.skip).to.equal(skip);
      expect(balanceResponses._pagination.count).to.equal(ctx.users.length);
    });
  });

  describe('updateBalances', async () => {
    it('should be able to get balance without cache being created', async () => {
      await new BalanceService().clearBalanceCache();
      await Promise.all(ctx.users.map(
        async (user) => {
          const cachedBalance = await Balance.findOne({ where: { userId: user.id } });
          expect(cachedBalance).to.be.null;
          const balance = await new BalanceService().getBalance(user.id);
          expect(balance).to.not.be.NaN;
        },
      ));
    });
    it('should have equal balances when cache is created', async () => {
      await new BalanceService().updateBalances({});
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        const actualBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers);

        // eslint-disable-next-line no-await-in-loop
        const cachedBalance = await Balance.findOne({ where: { userId: user.id }, relations: ['user', 'lastTransaction', 'lastTransfer'] });
        expect(cachedBalance).to.not.be.undefined;
        // eslint-disable-next-line no-await-in-loop
        const balance = await new BalanceService().getBalance(user.id);

        if (cachedBalance.lastTransaction) {
          expect(cachedBalance.lastTransaction.id).to.equal(actualBalance.lastTransaction.id);
        } else {
          expect(actualBalance.lastTransaction).to.be.undefined;
        }
        if (cachedBalance.lastTransfer) {
          expect(cachedBalance.lastTransfer.id).to.equal(actualBalance.lastTransfer.id);
        } else {
          expect(actualBalance.lastTransfer).to.be.undefined;
        }

        expect(actualBalance.amount.getAmount()).to.equal(balance.amount.amount);
        expect(cachedBalance.amount.getAmount()).to.equal(balance.amount.amount);
      }
    });
    it('should be able to clear balance for specific users', async () => {
      await new BalanceService().clearBalanceCache([ctx.users[0].id, ctx.users[1].id]);

      let cachedBalance = await Balance.findOne({ where: { userId: ctx.users[0].id } });
      expect(cachedBalance).to.be.null;

      cachedBalance = await Balance.findOne({ where: { userId: ctx.users[1].id } });
      expect(cachedBalance).to.be.null;

      const actualBalance = calculateBalance(ctx.users[0], ctx.transactions, ctx.subTransactions, ctx.transfers);
      const balance = await new BalanceService().getBalance(ctx.users[0].id);
      expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());

      const actualBalance2 = calculateBalance(ctx.users[1], ctx.transactions, ctx.subTransactions, ctx.transfers);
      const balance2 = await new BalanceService().getBalance(ctx.users[1].id);
      expect(balance2.amount.amount).to.equal(actualBalance2.amount.getAmount());
    });
    it('should be able to cache the balance of certain users', async () => {
      await new BalanceService().updateBalances({ ids: [ctx.users[0].id, ctx.users[1].id] });

      let cachedBalance = await Balance.findOne({ where: { userId: ctx.users[0].id } });
      expect(cachedBalance).to.not.be.undefined;

      cachedBalance = await Balance.findOne({ where: { userId: ctx.users[1].id } });
      expect(cachedBalance).to.not.be.undefined;

      const actualBalance = calculateBalance(ctx.users[0], ctx.transactions, ctx.subTransactions, ctx.transfers);
      const balance = await new BalanceService().getBalance(ctx.users[0].id);
      expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());

      const actualBalance2 = calculateBalance(ctx.users[1], ctx.transactions, ctx.subTransactions, ctx.transfers);
      const balance2 = await new BalanceService().getBalance(ctx.users[1].id);
      expect(balance2.amount.amount).to.equal(actualBalance2.amount.getAmount());
    });
    it('should be able to alter balance after adding transaction', async () => {
      // Sanity action to make sure we always start in a completely cached state
      await new BalanceService().updateBalances({});

      const user = ctx.users[0];
      const oldBalance = await new BalanceService().getBalance(user.id);
      const oldBalanceCache = await Balance.findOne({
        where: { userId: user.id },
        relations: ['user', 'lastTransaction', 'lastTransfer'],
      });
      // Sanity check
      expect(oldBalanceCache).to.not.be.undefined;

      const { transaction, amount } = await addTransaction(user, ctx.pointOfSaleRevisions, false);
      // Sanity check
      const dbTransaction = await Transaction.findOne({ where: { id: transaction.id } });
      expect(dbTransaction).to.not.be.undefined;

      const newBalance = await new BalanceService().getBalance(user.id);
      let newBalanceCache = await Balance.findOne({
        where: { userId: user.id },
        relations: ['user', 'lastTransaction', 'lastTransfer'],
      });

      expect(newBalance.id).to.equal(user.id);
      expect(newBalance.amount.amount).to.equal(oldBalance.amount.amount - amount.amount);
      expect(newBalance.amount.amount).to
        .equal(oldBalanceCache!.amount.getAmount() - amount.amount);
      expect(newBalanceCache!.amount.getAmount()).to.equal(oldBalanceCache!.amount.getAmount());
      expect(newBalanceCache!.lastTransaction.id).to.equal(oldBalanceCache!.lastTransaction.id);

      await new BalanceService().updateBalances({});
      newBalanceCache = await Balance.findOne({
        where: { userId: user.id },
        relations: ['user', 'lastTransaction', 'lastTransfer'],
      });
      expect(newBalanceCache.lastTransaction.id).to.equal(transaction.id);
      expect(newBalanceCache.amount.getAmount()).to.equal(newBalance.amount.amount);
      expect(newBalanceCache.amount.getAmount()).to.not.equal(oldBalanceCache.amount.getAmount());
    });
  });

  describe('getBalance', () => {
    it('should return 0 for new user', async () => {
      const newUser = await (await UserFactory()).get();
      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
      expect(balance.fine).to.be.null;
      expect(balance.fineSince).to.be.null;
      expect(balance.nrFines).to.equal(0);
      expect(balance.fineWaived).to.be.null;
      expect(balance.lastTransactionId).to.equal(-1);
      expect(balance.lastTransactionDate).to.be.null;
      expect(balance.lastTransferId).to.equal(-1);
    });
    it('should return correct balance for new user with single outgoing transaction', async () => {
      const newUser = await (await UserFactory()).get();
      const { transaction, amount } = await addTransaction(newUser, ctx.pointOfSaleRevisions, false);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
      expect(balance.lastTransactionId).to.equal(transaction.id);
      expect(balance.lastTransactionDate).to.equal(transaction.createdAt.toISOString());
      expect(balance.lastTransferId).to.equal(-1);
    });
    it('should return correct balance for new user with single incoming transaction', async () => {
      const newUser = await (await UserFactory()).get();
      const { transaction, amount } = await addTransaction(newUser, ctx.pointOfSaleRevisions, true);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount);
      expect(balance.lastTransactionId).to.equal(transaction.id);
      expect(balance.lastTransactionDate).to.equal(transaction.createdAt.toISOString());
      expect(balance.lastTransferId).to.equal(-1);
    });
    it('should correctly return balance for new user with single outgoing transfer', async () => {
      const newUser = await (await UserFactory()).get();
      const { transfer, amount } = await addTransfer(newUser, ctx.users, false);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
      expect(balance.lastTransactionId).to.equal(-1);
      expect(balance.lastTransactionDate).to.be.null;
      expect(balance.lastTransferId).to.equal(transfer.id);
    });
    it('should correctly return balance for new user with single incoming transfer', async () => {
      const newUser = await (await UserFactory()).get();
      const { transfer, amount } = await addTransfer(newUser, ctx.users, true);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount);
      expect(balance.lastTransactionId).to.equal(-1);
      expect(balance.lastTransactionDate).to.be.null;
      expect(balance.lastTransferId).to.equal(transfer.id);
    });
    it('should return correct balance for new user with two outgoing transactions and balance cache', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transaction, amount,
      } = await addTransaction(newUser, ctx.pointOfSaleRevisions, false, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransaction: transaction,
        amount: DineroTransformer.Instance.from(-amount.amount),
      } as any]);
      const transaction2 = await addTransaction(newUser, ctx.pointOfSaleRevisions, false);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount - transaction2.amount.amount);
      expect(balance.lastTransactionId).to.equal(transaction2.transaction.id);
      expect(balance.lastTransactionDate).to.equal(transaction2.transaction.createdAt.toISOString());
      expect(balance.lastTransferId).to.equal(-1);
    });
    it('should return correct balance for new user with two incoming transactions and balance cache', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transaction, amount,
      } = await addTransaction(newUser, ctx.pointOfSaleRevisions, true, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransaction: transaction,
        lastTransfer: undefined,
        amount: DineroTransformer.Instance.from(amount.amount),
      } as any]);
      const transaction2 = await addTransaction(newUser, ctx.pointOfSaleRevisions, true);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount + transaction2.amount.amount);
      expect(balance.lastTransactionId).to.equal(transaction2.transaction.id);
      expect(balance.lastTransactionDate).to.equal(transaction2.transaction.createdAt.toISOString());
      expect(balance.lastTransferId).to.equal(-1);
    });
    it('should correctly return balance for new user with two outgoing transfers with balance cache', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transfer, amount,
      } = await addTransfer(newUser, ctx.users, false, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransfer: transfer,
        amount: DineroTransformer.Instance.from(-amount.amount),
      } as any]);
      const transfer2 = await addTransfer(newUser, ctx.users, false);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount - transfer2.amount.amount);
      expect(balance.lastTransactionId).to.equal(-1);
      expect(balance.lastTransactionDate).to.be.null;
      expect(balance.lastTransferId).to.equal(transfer2.transfer.id);
    });
    it('should correctly return balance for new user with single incoming transfer', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transfer, amount,
      } = await addTransfer(newUser, ctx.users, true, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransfer: transfer,
        amount: DineroTransformer.Instance.from(amount.amount),
      } as any]);
      const transfer2 = await addTransfer(newUser, ctx.users, true);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount + transfer2.amount.amount);
      expect(balance.lastTransactionId).to.equal(-1);
      expect(balance.lastTransactionDate).to.be.null;
      expect(balance.lastTransferId).to.equal(transfer2.transfer.id);
    });
    it('should correctly return balance for new user with incoming and outgoing transactions and transfers', async () => {
      const newUser = await (await UserFactory()).get();
      await addTransaction(newUser, ctx.pointOfSaleRevisions, false);
      await addTransaction(newUser, ctx.pointOfSaleRevisions, true);
      await addTransfer(newUser, ctx.users, false);
      await addTransfer(newUser, ctx.users, true);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
    });
    it('should correctly return balance for new user with incoming and outgoing transactions and transfers with cache', async () => {
      const newUser = await (await UserFactory()).get();
      const transaction = await addTransaction(newUser, ctx.pointOfSaleRevisions, false);
      const transfer = await addTransfer(newUser, ctx.users, false);
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransaction: transaction.transaction,
        lastTransfer: transfer.transfer,
        amount: DineroTransformer.Instance
          .from(-transaction.amount.amount - transfer.amount.amount),
      } as any]);
      const oldBalanceCache = await Balance.findOne({
        where: { userId: newUser.id },
        relations: ['user', 'lastTransaction', 'lastTransfer'],
      });
      expect(oldBalanceCache).to.not.be.undefined;
      expect(oldBalanceCache.lastTransaction).to.not.be.undefined;

      // It should not use the transactions already in the database
      await SubTransactionRow.delete(Array.prototype.concat(
        ...transaction.transaction.subTransactions
          .map((sub) => sub.subTransactionRows
            .map((row) => row.id)),
      ));
      await SubTransaction.delete(transaction.transaction.subTransactions.map((sub) => sub.id));
      await Transaction.delete(transaction.transaction.id);

      const removedBalanceCache = await Balance.findOne({
        where: { userId: newUser.id },
        relations: ['user', 'lastTransaction', 'lastTransfer'],
      });
      expect(removedBalanceCache).to.be.null;
      expect(await Transaction.findOne({ where: { id: transaction.transaction.id } }))
        .to.be.null;
      expect(await Transfer.findOne({ where: { id: transfer.transfer.id } }))
        .to.not.be.undefined;

      const transaction2 = await addTransaction(newUser, ctx.pointOfSaleRevisions, true);
      const transfer2 = await addTransfer(newUser, ctx.users, true);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(transaction2.amount.amount
        + transfer2.amount.amount - transfer.amount.amount);
    });
    it('should return 0 if date before first transaction and transfer', async () => {
      const transaction = await Transaction.findOne({ where: {}, order: { createdAt: 'ASC' } });
      const transfer = await Transfer.findOne({ where: {}, order: { createdAt: 'ASC' } });
      const date = new Date(Math.min(
        transaction.createdAt.getTime(), transfer.createdAt.getTime(),
      ) - 1000);
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        const expectedBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, date);
        // sanity check
        expect(expectedBalance.amount.getAmount()).to.equal(0);
        // eslint-disable-next-line no-await-in-loop
        const actualBalance = await new BalanceService().getBalance(user.id, date);
        expect(actualBalance.amount.amount).to.equal(0);
      }
    });
    it('should return current balance if date before first transaction and transfer', async () => {
      const transaction = await Transaction.findOne({ where: {}, order: { createdAt: 'DESC' } });
      const transfer = await Transfer.findOne({ where: {}, order: { createdAt: 'DESC' } });
      const date = new Date(Math.max(
        transaction.createdAt.getTime(), transfer.createdAt.getTime(),
      ) + 1000);
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        // eslint-disable-next-line no-await-in-loop
        const expectedBalance = await new BalanceService().getBalance(user.id);
        // eslint-disable-next-line no-await-in-loop
        const actualBalance = await new BalanceService().getBalance(user.id, date);
        expect(actualBalance.amount.amount).to.equal(expectedBalance.amount.amount);
      }
    });
    it('should return correct balance on given date', async () => {
      const date = new Date('2021-01-01');
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        const expectedBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, date);
        // eslint-disable-next-line no-await-in-loop
        const actualBalance = await new BalanceService().getBalance(user.id, date);
        expect(actualBalance.amount.amount).to.equal(expectedBalance.amount.getAmount());
      }
    });
    it('should use balance cache when determining lastTransactionId', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transaction, amount,
      } = await addTransaction(newUser, ctx.pointOfSaleRevisions, false, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransaction: transaction,
        amount: DineroTransformer.Instance.from(-amount.amount),
      } as any]);

      const balance = await new BalanceService().getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
      expect(balance.lastTransactionId).to.equal(transaction.id);
      expect(balance.lastTransactionDate).to.equal(transaction.createdAt.toISOString());
      expect(balance.lastTransferId).to.equal(-1);
    });
  });

  describe('calculateTotalBalances', () => {
    it('should return the correct total balances', async () => {
      const date = new Date('2021-01-01');
      await new BalanceService().clearBalanceCache();

      const allBalances = await new BalanceService().getBalances({
        date,
      });

      const { positiveBalances, negativeBalances } = allBalances.records
        .reduce((acc, balance) => {
          const amount = balance.amount.amount;
          if (amount > 0) {
            acc.positiveBalances += amount;
          } else {
            acc.negativeBalances += amount;
          }
          return acc;
        }, { positiveBalances: 0, negativeBalances: 0 });

      const totalBalanceResponse = await new BalanceService().calculateTotalBalances(date);
      expect(totalBalanceResponse.totalPositive.amount).to.eq(positiveBalances);
      expect(totalBalanceResponse.totalNegative.amount).to.eq(negativeBalances);
    });
    it('should return the correct total balances for all usertypes', async () => {
      const date = new Date('2021-01-01');
      await new BalanceService().clearBalanceCache();

      const allBalances = await new BalanceService().getBalances({
        date,
      });

      const userTypeBalances: UserTypeTotalBalanceResponse[] = [];

      for (const type of Object.values(UserType)) {
        const { positiveBalances, negativeBalances } = allBalances.records
          .filter((r) => r.type == type)
          .reduce((acc, balance) => {
            const amount = balance.amount.amount;
            if (amount > 0) {
              acc.positiveBalances += amount;
            } else {
              acc.negativeBalances += amount;
            }
            return acc;
          }, { positiveBalances: 0, negativeBalances: 0 });
        userTypeBalances.push({
          userType: type,
          totalPositive: DineroTransformer.Instance.from(positiveBalances).toObject(),
          totalNegative: DineroTransformer.Instance.from(negativeBalances).toObject(),
        });
      }

      const totalBalanceResponse = await new BalanceService().calculateTotalBalances(date);
      totalBalanceResponse.userTypeBalances.forEach((u) => {
        const index = userTypeBalances.findIndex((b) => b.userType === u.userType);
        expect(u.userType).to.be.eq(userTypeBalances[index].userType);
        expect(u.totalPositive.amount).to.be.eq(userTypeBalances[index].totalPositive.amount);
        expect(u.totalNegative.amount).to.be.eq(userTypeBalances[index].totalNegative.amount);
      });
    });
  });
});
