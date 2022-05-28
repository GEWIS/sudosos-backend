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
import { DineroObject } from 'dinero.js';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import BalanceService from '../../../src/service/balance-service';
import User from '../../../src/entity/user/user';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Balance from '../../../src/entity/transactions/balance';
import { UserFactory } from '../../helpers/user-factory';
import TransactionService from '../../../src/service/transaction-service';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import TransferService from '../../../src/service/transfer-service';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';

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

  const calculateBalance = (user: User): Balance => {
    const transactionsOutgoing = ctx.transactions.filter((t) => t.from.id === user.id)
      .sort((a, b) => b.id - a.id);
    const transactionsIncoming = ctx.subTransactions.filter((s) => s.to.id === user.id)
      .sort((a, b) => b.id - a.id);
    const transfersOutgoing = ctx.transfers.filter((t) => t.from && t.from.id === user.id)
      .sort((a, b) => b.id - a.id);
    const transfersIncoming = ctx.transfers.filter((t) => t.to && t.to.id === user.id)
      .sort((a, b) => b.id - a.id);

    const valueTransactionsOutgoing: number = Array.prototype
      .concat(...Array.prototype.concat(...transactionsOutgoing
        .map((t) => t.subTransactions
          .map((s) => s.subTransactionRows))))
      .reduce((prev: number, curr: SubTransactionRow) => (
        prev - (curr.amount * curr.product.priceInclVat.getAmount())
      ), 0);
    const valueTransactionsIncoming = Array.prototype.concat(...transactionsIncoming
      .map((s) => s.subTransactionRows))
      .reduce((prev: number, curr: SubTransactionRow) => (
        prev + (curr.amount * curr.product.priceInclVat.getAmount())
      ), 0);
    const valueTransfersOutgoing = transfersOutgoing
      .reduce((prev, curr) => prev - curr.amount.getAmount(), 0);
    const valueTransfersIncoming = transfersIncoming
      .reduce((prev, curr) => prev + curr.amount.getAmount(), 0);

    // const lastIncomingTransaction = transactionsIncoming.length > 0 ? ctx.transactions
    //   .find((t) => t.subTransactions
    //     .findIndex((s) => s.id === transactionsIncoming[0].id) >= 0) : undefined;

    // Calculate the user's personal last transaction/transfer
    //
    // let lastTransaction: number | undefined;
    // if (transactionsOutgoing.length > 0 && lastIncomingTransaction) {
    //   lastTransaction = transactionsOutgoing[0].id > lastIncomingTransaction.id
    //     ? transactionsOutgoing[0].id : lastIncomingTransaction.id;
    // } else if (transactionsOutgoing.length > 0) {
    //   lastTransaction = transactionsOutgoing[0].id;
    // } else if (lastIncomingTransaction) {
    //   lastTransaction = lastIncomingTransaction.id;
    // }
    // let lastTransfer: number | undefined;
    // if (transfersOutgoing.length > 0 && transfersIncoming.length > 0) {
    //   lastTransfer = transfersOutgoing[0].id > transfersIncoming[0].id
    //     ? transfersOutgoing[0].id : transfersIncoming[0].id;
    // } else if (transfersOutgoing.length > 0) {
    //   lastTransfer = transfersOutgoing[0].id;
    // } else if (transfersIncoming.length > 0) {
    //   lastTransfer = transfersIncoming[0].id;
    // }
    const lastTransaction = ctx.transactions.sort((a, b) => b.id - a.id)[0].id;
    const lastTransfer = ctx.transfers.sort((a, b) => b.id - a.id)[0].id;

    return {
      user,
      user_id: user.id,
      lastTransaction,
      lastTransfer,
      amount: valueTransactionsOutgoing + valueTransactionsIncoming
        + valueTransfersOutgoing + valueTransfersIncoming,
    } as Balance;
  };

  const addTransaction = async (newUser: User, receivedBalance: boolean): Promise<{
    transaction: Transaction,
    amount: DineroObject,
  }> => {
    let from: number;
    let to: number;

    const pointOfSale = ctx.pointOfSaleRevisions
      .find((p) => p.containers.length > 0 && p.containers
        .find((c) => c.products.length > 0) !== undefined)!;
    const container = pointOfSale.containers
      .find((c) => c.products.length > 0)!;
    const product = container.products[0];

    if (receivedBalance) {
      from = product.product.owner.id;
      to = newUser.id;
    } else {
      to = product.product.owner.id;
      from = newUser.id;
    }
    const totalPriceInclVat = product.priceInclVat.toObject();
    let transaction = await TransactionService.asTransaction({
      from,
      createdBy: newUser.id,
      pointOfSale: {
        id: pointOfSale.pointOfSale.id,
        revision: pointOfSale.revision,
      },
      totalPriceInclVat,
      subTransactions: [{
        to,
        container: {
          id: container.container.id,
          revision: container.revision,
        },
        totalPriceInclVat,
        subTransactionRows: [{
          product: {
            id: product.product.id,
            revision: product.revision,
          },
          amount: 1,
          totalPriceInclVat,
        }],
      }],
    });
    transaction = await Transaction.save(transaction);
    return {
      transaction,
      amount: totalPriceInclVat,
    };
  };

  const addTransfer = async (newUser: User, receivedBalance: boolean): Promise<{
    transfer: Transfer,
    amount: DineroObject,
  }> => {
    let fromId: number;
    let toId: number;
    if (receivedBalance) {
      toId = newUser.id;
      fromId = ctx.users[0].id;
    } else {
      fromId = newUser.id;
      toId = ctx.users[0].id;
    }

    const amount: DineroObject = {
      amount: 1000,
      precision: 2,
      currency: 'EUR',
    };
    const transfer = await TransferService.createTransfer({
      amount,
      description: '',
      fromId,
      toId,
    });
    return {
      transfer,
      amount,
    };
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    const {
      productRevisions, containerRevisions, pointOfSaleRevisions, transactions, transfers,
    } = await seedDatabase();
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

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
    await ctx.connection.close();
  });

  describe('getBalances', () => {
    it('should return balances from all users', async () => {
      const balanceResponses = await BalanceService.getBalances();
      expect(balanceResponses.length).to.equal(ctx.users.length);

      balanceResponses.forEach((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        const actualBalance = calculateBalance(user);
        expect(balance.amount.amount).to.equal(actualBalance.amount);
      });
    });
    it('should return balance from subset of users', async () => {
      const users = [ctx.users[10], ctx.users[11], ctx.users[12]];
      const balanceResponses = await BalanceService.getBalances(users.map((u) => u.id));
      expect(balanceResponses.length).to.equal(users.length);

      balanceResponses.forEach((balance) => {
        const user = ctx.users.find((u) => u.id === balance.id);
        const actualBalance = calculateBalance(user);
        expect(balance.amount.amount).to.equal(actualBalance.amount);
      });
    });
  });

  describe('Check balance updates', async () => {
    it('should be able to get balance without cache being created', async () => {
      await BalanceService.clearBalanceCache();
      await Promise.all(ctx.users.map(
        async (user) => {
          const cachedBalance = await Balance.findOne(user.id);
          expect(cachedBalance).to.be.undefined;
          const balance = await BalanceService.getBalance(user.id);
          expect(balance).to.not.be.NaN;
        },
      ));
    });
    it('should have equal balances when cache is created', async () => {
      await BalanceService.updateBalances();
      for (let i = 0; i < ctx.users.length; i += 1) {
        const user = ctx.users[i];
        const actualBalance = calculateBalance(user);

        // eslint-disable-next-line no-await-in-loop
        const cachedBalance = await Balance.findOne(user.id);
        expect(cachedBalance).to.not.be.undefined;
        // eslint-disable-next-line no-await-in-loop
        const balance = await BalanceService.getBalance(user.id);
        expect(balance.amount.amount).to.equal(actualBalance.amount);
        expect(cachedBalance.lastTransaction).to.equal(actualBalance.lastTransaction);
        expect(cachedBalance.lastTransfer).to.equal(actualBalance.lastTransfer);
      }
    });
    it('should be able to clear balance for specific users', async () => {
      await BalanceService.clearBalanceCache([ctx.users[0].id, ctx.users[1].id]);

      let cachedBalance = await Balance.findOne(ctx.users[0].id);
      expect(cachedBalance).to.be.undefined;

      cachedBalance = await Balance.findOne(ctx.users[1].id);
      expect(cachedBalance).to.be.undefined;

      const actualBalance = await calculateBalance(ctx.users[0]);
      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance.amount.amount).to.equal(actualBalance.amount);

      const actualBalance2 = await calculateBalance(ctx.users[1]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2.amount.amount).to.equal(actualBalance2.amount);
    });
    it('should be able to cache the balance of certain users', async () => {
      await BalanceService.updateBalances({ ids: [ctx.users[0].id, ctx.users[1].id] });

      let cachedBalance = await Balance.findOne(ctx.users[0].id);
      expect(cachedBalance).to.not.be.undefined;

      cachedBalance = await Balance.findOne(ctx.users[1].id);
      expect(cachedBalance).to.not.be.undefined;

      const actualBalance = await calculateBalance(ctx.users[0]);
      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance.amount.amount).to.equal(actualBalance.amount);

      const actualBalance2 = await calculateBalance(ctx.users[1]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2.amount.amount).to.equal(actualBalance2.amount);
    });
    it('should be able to alter balance after adding transaction', async () => {
      // Sanity action to make sure we always start in a completely cached state
      await BalanceService.updateBalances();

      const user = ctx.users[0];
      const oldBalance = await BalanceService.getBalance(user.id);
      const oldBalanceCache = await Balance.findOne({ where: { user_id: user.id } });
      // Sanity check
      expect(oldBalanceCache).to.not.be.undefined;

      const { transaction, amount } = await addTransaction(user, false);

      const newBalance = await BalanceService.getBalance(user.id);
      let newBalanceCache = await Balance.findOne({ where: { user_id: user.id } });

      expect(newBalance.id).to.equal(user.id);
      expect(newBalance.amount.amount).to.equal(oldBalance.amount.amount - amount.amount);
      expect(newBalance.amount.amount).to.equal(oldBalanceCache!.amount - amount.amount);
      expect(newBalanceCache!.amount).to.equal(oldBalanceCache!.amount);
      expect(newBalanceCache!.lastTransaction).to.equal(oldBalanceCache!.lastTransaction);

      await BalanceService.updateBalances();
      newBalanceCache = await Balance.findOne({ where: { user_id: user.id } });
      expect(newBalanceCache.lastTransaction).to.equal(transaction.id);
      expect(newBalanceCache.lastTransaction).to.equal(newBalance.lastTransactionId + 1);
      expect(newBalanceCache.amount).to.equal(newBalance.amount.amount);
      expect(newBalanceCache.amount).to.not.equal(oldBalanceCache.amount);
    });
  });

  describe('getBalance', () => {
    it('should return 0 for new user', async () => {
      const newUser = await (await UserFactory().default()).get();
      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
    });
    it('should return correct balance for new user with single outgoing transaction', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { amount } = await addTransaction(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
    });
    it('should return correct balance for new user with single incoming transaction', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { amount } = await addTransaction(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount);
    });
    it('should correctly return balance for new user with single outgoing transfer', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { amount } = await addTransfer(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount);
    });
    it('should correctly return balance for new user with single incoming transfer', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { amount } = await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount);
    });
    it('should return correct balance for new user with two outgoing transactions and balance cache', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { transaction, amount } = await addTransaction(newUser, false);
      await Balance.save([{
        user_id: newUser.id,
        user: newUser,
        lastTransaction: transaction.id,
        lastTransfer: undefined,
        amount: -amount.amount,
      } as Balance]);
      const transaction2 = await addTransaction(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount - transaction2.amount.amount);
    });
    it('should return correct balance for new user with two incoming transactions and balance cache', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { transaction, amount } = await addTransaction(newUser, true);
      await Balance.save([{
        user_id: newUser.id,
        user: newUser,
        lastTransaction: transaction.id,
        lastTransfer: undefined,
        amount: amount.amount,
      } as Balance]);
      const transaction2 = await addTransaction(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount + transaction2.amount.amount);
    });
    it('should correctly return balance for new user with two outgoing transfers with balance cache', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { transfer, amount } = await addTransfer(newUser, false);
      await Balance.save([{
        user_id: newUser.id,
        user: newUser,
        lastTransfer: transfer.id,
        amount: -amount.amount,
      } as Balance]);
      const transfer2 = await addTransfer(newUser, false);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-amount.amount - transfer2.amount.amount);
    });
    it('should correctly return balance for new user with single incoming transfer', async () => {
      const newUser = await (await UserFactory().default()).get();
      const { transfer, amount } = await addTransfer(newUser, true);
      await Balance.save([{
        user_id: newUser.id,
        user: newUser,
        lastTransfer: transfer.id,
        amount: amount.amount,
      } as Balance]);
      const transfer2 = await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(amount.amount + transfer2.amount.amount);
    });
    it('should correctly return balance for new user with incoming and outgoing transactions and transfers', async () => {
      const newUser = await (await UserFactory().default()).get();
      await addTransaction(newUser, false);
      await addTransaction(newUser, true);
      await addTransfer(newUser, false);
      await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
    });
    it('should correctly return balance for new user with incoming and outgoing transactions and transfers with cache', async () => {
      const newUser = await (await UserFactory().default()).get();
      const transaction = await addTransaction(newUser, false);
      const transfer = await addTransfer(newUser, false);
      await Balance.save([{
        user_id: newUser.id,
        user: newUser,
        lastTransaction: transaction.transaction.id,
        lastTransfer: transfer.transfer.id,
        amount: -transaction.amount.amount - transfer.amount.amount,
      } as Balance]);

      // It should not use the transactions already in the database
      await SubTransactionRow.delete(Array.prototype.concat(
        ...transaction.transaction.subTransactions
          .map((sub) => sub.subTransactionRows
            .map((row) => row.id)),
      ));
      await SubTransaction.delete(transaction.transaction.subTransactions.map((sub) => sub.id));
      await Transaction.delete(transaction.transaction.id);
      await Transfer.delete(transfer.transfer.id);

      await addTransaction(newUser, true);
      await addTransfer(newUser, true);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(0);
    });
  });
});
