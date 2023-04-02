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

import express, { Application } from 'express';
import { expect } from 'chai';
import { Connection } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import Dinero, { DineroObject } from 'dinero.js';
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
import Swagger from '../../../src/start/swagger';
import BalanceService from '../../../src/service/balance-service';
import User from '../../../src/entity/user/user';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Balance from '../../../src/entity/transactions/balance';
import { UserFactory } from '../../helpers/user-factory';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';

describe('BalanceService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    users: User[],
    productRevisions: ProductRevision[],
    containerRevisions: ContainerRevision[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
    spec: SwaggerSpecification,
  };

  const calculateBalance = (user: User, date?: Date): Balance => {
    let transactionsOutgoing = ctx.transactions.filter((t) => t.from.id === user.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (date) {
      transactionsOutgoing = transactionsOutgoing
        .filter((t) => t.createdAt.getTime() <= date.getTime());
    }
    let transactionsIncoming = ctx.subTransactions.filter((s) => s.to.id === user.id)
      .sort((a, b) => b.transaction.createdAt.getTime() - a.transaction.createdAt.getTime())
      .map((s) => s.transaction);
    if (date) {
      transactionsIncoming = transactionsIncoming
        .filter((t) => t.createdAt.getTime() <= date.getTime());
    }
    let transfersOutgoing = ctx.transfers.filter((t) => t.from && t.from.id === user.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (date) {
      transfersOutgoing = transfersOutgoing
        .filter((t) => t.createdAt.getTime() <= date.getTime());
    }
    let transfersIncoming = ctx.transfers.filter((t) => t.to && t.to.id === user.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (date) {
      transfersIncoming = transfersIncoming
        .filter((t) => t.createdAt.getTime() <= date.getTime());
    }

    const valueTransactionsOutgoing: number = Array.prototype
      .concat(...Array.prototype.concat(...transactionsOutgoing
        .map((t) => t.subTransactions
          .map((s) => s.subTransactionRows))))
      .reduce((prev: number, curr: SubTransactionRow) => (
        prev - (curr.amount * curr.product.priceInclVat.getAmount())
      ), 0);
    const valueTransactionsIncoming: number = Array.prototype
      .concat(...Array.prototype.concat(...transactionsIncoming
        .map((t) => t.subTransactions
          .map((s) => s.subTransactionRows))))
      .reduce((prev: number, curr: SubTransactionRow) => (
        prev + (curr.amount * curr.product.priceInclVat.getAmount())
      ), 0);
    const valueTransfersOutgoing = transfersOutgoing
      .reduce((prev, curr) => prev - curr.amount.getAmount(), 0);
    const valueTransfersIncoming = transfersIncoming
      .reduce((prev, curr) => prev + curr.amount.getAmount(), 0);

    // Calculate the user's personal last transaction/transfer
    let lastTransaction: Transaction;
    const allTransactions = transactionsIncoming.concat(transactionsOutgoing)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (allTransactions.length > 0) {
      // eslint-disable-next-line prefer-destructuring
      lastTransaction = allTransactions
        .filter((t) => t.createdAt.getTime() === allTransactions[0].createdAt.getTime())
        .sort((a, b) => b.id - a.id)[0];
    }
    let lastTransfer: Transfer;
    const allTransfers = transfersIncoming.concat(transfersOutgoing)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (allTransfers.length > 0) {
      // eslint-disable-next-line prefer-destructuring
      lastTransfer = allTransfers
        .filter((t) => t.createdAt.getTime() === allTransfers[0].createdAt.getTime())
        .sort((a, b) => b.id - a.id)[0];
    }

    return {
      user,
      lastTransaction,
      lastTransfer,
      amount: DineroTransformer.Instance.from(valueTransactionsOutgoing + valueTransactionsIncoming
        + valueTransfersOutgoing + valueTransfersIncoming),
    } as Balance;
  };

  const addTransaction = async (
    newUser: User,
    receivedBalance: boolean,
    createdAt?: Date,
  ): Promise<{
    transaction: Transaction,
    amount: DineroObject,
  }> => {
    let from: User;
    let to: User;

    const pointOfSale = ctx.pointOfSaleRevisions
      .find((p) => p.containers.length > 0 && p.containers
        .find((c) => c.products.length > 0) !== undefined)!;
    const container = pointOfSale.containers
      .find((c) => c.products.length > 0)!;
    const product = container.products[0];

    if (receivedBalance) {
      from = product.product.owner;
      to = newUser;
    } else {
      to = product.product.owner;
      from = newUser;
    }
    const totalPriceInclVat = product.priceInclVat.toObject();
    let transaction = {
      from,
      createdBy: newUser,
      pointOfSale,
      createdAt: createdAt || undefined,
      updatedAt: createdAt || undefined,
      subTransactions: [
        {
          createdAt: createdAt || undefined,
          updatedAt: createdAt || undefined,
          to,
          container,
          subTransactionRows: [
            {
              createdAt: createdAt || undefined,
              updatedAt: createdAt || undefined,
              product,
              amount: 1,
            },
          ],
        },
      ],
    } as any as Transaction;
    transaction = await Transaction.save(transaction);
    return {
      transaction,
      amount: totalPriceInclVat,
    };
  };

  const addTransfer = async (newUser: User, receivedBalance: boolean, createdAt?: Date): Promise<{
    transfer: Transfer,
    amount: DineroObject,
  }> => {
    let from: User;
    let to: User;
    if (receivedBalance) {
      to = newUser;
      [from] = ctx.users;
    } else {
      from = newUser;
      [to] = ctx.users;
    }

    const amount: DineroObject = {
      amount: 1000,
      precision: 2,
      currency: 'EUR',
    };
    const transfer = await Transfer.save({
      createdAt,
      updatedAt: createdAt,
      amount: Dinero(amount),
      description: '',
      from,
      to,
    } as any);
    return {
      transfer,
      amount,
    };
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2021-11-30'));
    const transfers = await seedTransfers(users);
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    ctx = {
      connection,
      app,
      users,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('getBalances', () => {
    it('should return balances from all users', async () => {
      const balanceResponses = await BalanceService.getBalances();
      expect(balanceResponses.length).to.equal(ctx.users.length);

      balanceResponses.forEach((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        const actualBalance = calculateBalance(user);
        expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());
      });
    });
    it('should return balance from subset of users', async () => {
      const users = [ctx.users[10], ctx.users[11], ctx.users[12]];
      const balanceResponses = await BalanceService.getBalances(users.map((u) => u.id));
      expect(balanceResponses.length).to.equal(users.length);

      balanceResponses.forEach((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        const actualBalance = calculateBalance(user);
        expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());
      });
    });
  });

  describe('Check balance updates', async () => {
    it('should be able to get balance without cache being created', async () => {
      await BalanceService.clearBalanceCache();
      await Promise.all(ctx.users.map(
        async (user) => {
          const cachedBalance = await Balance.findOne({ where: { userId: user.id } });
          expect(cachedBalance).to.be.null;
          const balance = await BalanceService.getBalance(user.id);
          expect(balance).to.not.be.NaN;
        },
      ));
    });
    it('should have equal balances when cache is created', async () => {
      await BalanceService.updateBalances({});
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        const actualBalance = calculateBalance(user);

        // eslint-disable-next-line no-await-in-loop
        const cachedBalance = await Balance.findOne({ where: { userId: user.id }, relations: ['user', 'lastTransaction', 'lastTransfer'] });
        expect(cachedBalance).to.not.be.undefined;
        // eslint-disable-next-line no-await-in-loop
        const balance = await BalanceService.getBalance(user.id);

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
      await BalanceService.clearBalanceCache([ctx.users[0].id, ctx.users[1].id]);

      let cachedBalance = await Balance.findOne({ where: { userId: ctx.users[0].id } });
      expect(cachedBalance).to.be.null;

      cachedBalance = await Balance.findOne({ where: { userId: ctx.users[1].id } });
      expect(cachedBalance).to.be.null;

      const actualBalance = calculateBalance(ctx.users[0]);
      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());

      const actualBalance2 = calculateBalance(ctx.users[1]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2.amount.amount).to.equal(actualBalance2.amount.getAmount());
    });
    it('should be able to cache the balance of certain users', async () => {
      await BalanceService.updateBalances({ ids: [ctx.users[0].id, ctx.users[1].id] });

      let cachedBalance = await Balance.findOne({ where: { userId: ctx.users[0].id } });
      expect(cachedBalance).to.not.be.undefined;

      cachedBalance = await Balance.findOne({ where: { userId: ctx.users[1].id } });
      expect(cachedBalance).to.not.be.undefined;

      const actualBalance = calculateBalance(ctx.users[0]);
      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance.amount.amount).to.equal(actualBalance.amount.getAmount());

      const actualBalance2 = calculateBalance(ctx.users[1]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2.amount.amount).to.equal(actualBalance2.amount.getAmount());
    });
    it('should be able to alter balance after adding transaction', async () => {
      // Sanity action to make sure we always start in a completely cached state
      await BalanceService.updateBalances({});

      const user = ctx.users[0];
      const oldBalance = await BalanceService.getBalance(user.id);
      const oldBalanceCache = await Balance.findOne({
        where: { userId: user.id },
        relations: ['user', 'lastTransaction', 'lastTransfer'],
      });
      // Sanity check
      expect(oldBalanceCache).to.not.be.undefined;

      const { transaction, amount } = await addTransaction(user, false);
      // Sanity check
      const dbTransaction = await Transaction.findOne({ where: { id: transaction.id } });
      expect(dbTransaction).to.not.be.undefined;

      const newBalance = await BalanceService.getBalance(user.id);
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

      await BalanceService.updateBalances({});
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
      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
    });
    it('should return correct balance for new user with single outgoing transaction', async () => {
      const newUser = await (await UserFactory()).get();
      const { amount } = await addTransaction(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
    });
    it('should return correct balance for new user with single incoming transaction', async () => {
      const newUser = await (await UserFactory()).get();
      const { amount } = await addTransaction(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount);
    });
    it('should correctly return balance for new user with single outgoing transfer', async () => {
      const newUser = await (await UserFactory()).get();
      const { amount } = await addTransfer(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
    });
    it('should correctly return balance for new user with single incoming transfer', async () => {
      const newUser = await (await UserFactory()).get();
      const { amount } = await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount);
    });
    it('should return correct balance for new user with two outgoing transactions and balance cache', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transaction, amount,
      } = await addTransaction(newUser, false, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransaction: transaction,
        amount: DineroTransformer.Instance.from(-amount.amount),
      } as any]);
      const transaction2 = await addTransaction(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount - transaction2.amount.amount);
    });
    it('should return correct balance for new user with two incoming transactions and balance cache', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transaction, amount,
      } = await addTransaction(newUser, true, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransaction: transaction,
        lastTransfer: undefined,
        amount: DineroTransformer.Instance.from(amount.amount),
      } as any]);
      const transaction2 = await addTransaction(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount + transaction2.amount.amount);
    });
    it('should correctly return balance for new user with two outgoing transfers with balance cache', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transfer, amount,
      } = await addTransfer(newUser, false, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransfer: transfer,
        amount: DineroTransformer.Instance.from(-amount.amount),
      } as any]);
      const transfer2 = await addTransfer(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount - transfer2.amount.amount);
    });
    it('should correctly return balance for new user with single incoming transfer', async () => {
      const newUser = await (await UserFactory()).get();
      const {
        transfer, amount,
      } = await addTransfer(newUser, true, new Date(new Date().getTime() - 5000));
      await Balance.save([{
        userId: newUser.id,
        user: newUser,
        lastTransfer: transfer,
        amount: DineroTransformer.Instance.from(amount.amount),
      } as any]);
      const transfer2 = await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount + transfer2.amount.amount);
    });
    it('should correctly return balance for new user with incoming and outgoing transactions and transfers', async () => {
      const newUser = await (await UserFactory()).get();
      await addTransaction(newUser, false);
      await addTransaction(newUser, true);
      await addTransfer(newUser, false);
      await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
    });
    it('should correctly return balance for new user with incoming and outgoing transactions and transfers with cache', async () => {
      const newUser = await (await UserFactory()).get();
      const transaction = await addTransaction(newUser, false);
      const transfer = await addTransfer(newUser, false);
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

      const transaction2 = await addTransaction(newUser, true);
      const transfer2 = await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
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
        const expectedBalance = calculateBalance(user, date);
        // sanity check
        expect(expectedBalance.amount.getAmount()).to.equal(0);
        // eslint-disable-next-line no-await-in-loop
        const actualBalance = await BalanceService.getBalance(user.id, date);
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
        const expectedBalance = await BalanceService.getBalance(user.id);
        // eslint-disable-next-line no-await-in-loop
        const actualBalance = await BalanceService.getBalance(user.id, date);
        expect(actualBalance.amount.amount).to.equal(expectedBalance.amount.amount);
      }
    });
    it('should return correct balance on given date', async () => {
      const date = new Date('2021-01-01');
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        const expectedBalance = calculateBalance(user, date);
        // eslint-disable-next-line no-await-in-loop
        const actualBalance = await BalanceService.getBalance(user.id, date);
        expect(actualBalance.amount.amount).to.equal(expectedBalance.amount.getAmount());
      }
    });
  });
});
