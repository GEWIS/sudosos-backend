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
import { Connection, getManager } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DineroObject } from 'dinero.js';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import seedDatabase, { defineTransactions } from '../../seed';
import Swagger from '../../../src/start/swagger';
import BalanceService from '../../../src/service/balance-service';
import User from '../../../src/entity/user/user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Balance from '../../../src/entity/transactions/balance';
import { UserFactory } from '../../helpers/user-factory';
import TransactionService from '../../../src/service/transaction-service';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import TransferService from '../../../src/service/transfer-service';

describe('BalanceService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    balances: number[],
    users: User[],
    productRevisions: ProductRevision[],
    containerRevisions: ContainerRevision[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    transfers: Transfer[],
    spec: SwaggerSpecification,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    const {
      productRevisions, containerRevisions, pointOfSaleRevisions, transactions, transfers,
    } = await seedDatabase();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

    const balances: number[] = [];
    await Promise.all(users.map(
      async (user) => { balances[user.id] = await BalanceService.getBalance(user.id); },
    ));

    ctx = {
      connection,
      app,
      balances,
      users,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      transfers,
      spec: await Swagger.importSpecification(),
    };
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
      await Promise.all(ctx.users.map(
        async (user) => {
          const cachedBalance = await Balance.findOne(user.id);
          expect(cachedBalance).to.not.be.undefined;
          const balance = await BalanceService.getBalance(user.id);
          expect(balance).to.equal(ctx.balances[user.id]);
        },
      ));
    });

    it('should be able to clear balance for specific users', async () => {
      await BalanceService.clearBalanceCache([ctx.users[0].id, ctx.users[1].id]);

      let cachedBalance = await Balance.findOne(ctx.users[0].id);
      expect(cachedBalance).to.be.undefined;

      cachedBalance = await Balance.findOne(ctx.users[1].id);
      expect(cachedBalance).to.be.undefined;

      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance).to.equal(ctx.balances[ctx.users[0].id]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2).to.equal(ctx.balances[ctx.users[1].id]);
    });

    it('should be able to cache the balance of certain users', async () => {
      await BalanceService.updateBalances({ ids: [ctx.users[0].id, ctx.users[1].id] });

      let cachedBalance = await Balance.findOne(ctx.users[0].id);
      expect(cachedBalance).to.not.be.undefined;

      cachedBalance = await Balance.findOne(ctx.users[1].id);
      expect(cachedBalance).to.not.be.undefined;

      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance).to.equal(ctx.balances[ctx.users[0].id]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2).to.equal(ctx.balances[ctx.users[1].id]);
    });

    it('should be able to alter balance by adding transactions', async () => {
      const entityManager = getManager();
      const lastTransaction = (await entityManager.query('SELECT MAX(id) as id from `transaction`'))[0].id ?? 0;
      const lastSubTransaction = (await entityManager.query('SELECT MAX(id) as id from `sub_transaction`'))[0].id ?? 0;
      const lastRowTransaction = (await entityManager.query('SELECT MAX(id) as id from `sub_transaction_row`'))[0].id ?? 0;

      const pointOfSale = await PointOfSale.findOne(1);
      const pointOfSaleRevision = await PointOfSaleRevision.findOne(
        { pointOfSale, revision: pointOfSale.currentRevision },
        { relations: ['pointOfSale', 'pointOfSale.owner', 'containers', 'containers.products', 'containers.products.product'] },
      );

      const transactions = defineTransactions(
        lastTransaction,
        lastSubTransaction,
        lastRowTransaction,
        1,
        pointOfSaleRevision,
        ctx.users[0],
        ctx.users[1],
      );

      const saveTransactionPromise = Transaction.save(transactions);

      const oldBalanceTotal = ctx.balances.reduce((a, b) => a + b, 0);

      transactions.forEach((transaction) => {
        let total = 0;
        transaction.subTransactions.forEach((subTransaction) => {
          const toId = subTransaction.to.id;
          subTransaction.subTransactionRows.forEach((subTransactionRow) => {
            const value = subTransactionRow.product.priceInclVat.getAmount()
              * subTransactionRow.amount;
            ctx.balances[toId] += value;
            total += value;
          });
        });
        ctx.balances[transaction.from.id] -= total;
      });

      const newBalanceTotal = ctx.balances.reduce((a, b) => a + b, 0);

      // Sanity check to see if balances are still equal, basically checking arithmic above
      expect(oldBalanceTotal).to.equal(newBalanceTotal);

      await saveTransactionPromise;
      const newBalances = [0];
      await Promise.all(ctx.users.map(
        async (user) => { newBalances[user.id] = await BalanceService.getBalance(user.id); },
      ));

      // Check that new transactions are included in the balance
      ctx.users.forEach((user) => {
        expect(ctx.balances[user.id]).to.equal(newBalances[user.id]);
      });

      const balanceMap = await BalanceService.getAllBalances();

      ctx.users.forEach((user) => {
        expect(ctx.balances[user.id]).to.equal(balanceMap.get(user.id));
      });
    });

    describe('Get balance', () => {
      const addTransaction = async (newUser: User, receivedBalance: boolean) => {
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
        const transaction = await TransactionService.asTransaction({
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
        await Transaction.save(transaction);
        return totalPriceInclVat;
      };

      const addTransfer = async (newUser: User, receivedBalance: boolean) => {
        let fromId: number;
        let toId: number;
        if (receivedBalance) {
          toId = newUser.id;
          fromId = ctx.users[0].id;
        } else {
          fromId = newUser.id;
          toId = ctx.users[0].id;
        }

        const amount = 1000;
        await TransferService.createTransfer({
          amount: {
            amount,
            precision: 2,
            currency: 'EUR',
          },
          description: '',
          fromId,
          toId,
        });
        return amount;
      };

      it('should return 0 for new user', async () => {
        const newUser = await (await UserFactory().default()).get();
        const balance = await BalanceService.getBalance(newUser.id);
        expect(balance).to.equal(0);
      });
      it('should return correct balance for new user with single outgoing transaction', async () => {
        const newUser = await (await UserFactory().default()).get();
        const totalPriceInclVat = await addTransaction(newUser, false);

        const balance = await BalanceService.getBalance(newUser.id);
        expect(balance).to.equal(-totalPriceInclVat.amount);
      });
      it('should return correct balance for new user with single incoming transaction', async () => {
        const newUser = await (await UserFactory().default()).get();
        const totalPriceInclVat = await addTransaction(newUser, true);

        const balance = await BalanceService.getBalance(newUser.id);
        expect(balance).to.equal(totalPriceInclVat.amount);
      });
      it('should correctly return balance for new user with single outgoing transfer', async () => {
        const newUser = await (await UserFactory().default()).get();
        const amount = await addTransfer(newUser, false);

        const balance = await BalanceService.getBalance(newUser.id);
        expect(balance).to.equal(-amount);
      });
      it('should correctly return balance for new user with single incoming transfer', async () => {
        const newUser = await (await UserFactory().default()).get();
        const amount = await addTransfer(newUser, true);

        const balance = await BalanceService.getBalance(newUser.id);
        expect(balance).to.equal(amount);
      });
    });

    after(async () => {
      await ctx.connection.close();
    });
  });
});
