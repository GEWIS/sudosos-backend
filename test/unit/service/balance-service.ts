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
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase, { defineTransactions } from '../../seed';
import Swagger from '../../../src/start/swagger';
import BalanceService from '../../../src/service/balance-service';
import User from '../../../src/entity/user/user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Balance from '../../../src/entity/transactions/balance';

describe('BalanceService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    balances: number[],
    users: User[],
    spec: SwaggerSpecification,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    await seedDatabase();

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

    after(async () => {
      await ctx.connection.close();
    });
  });
});
