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

describe('BalanceService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    balances: number[],
    users: User[],
    spec: SwaggerSpecification,
  };

  // eslint-disable-next-line func-names
  before(async function (): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    await seedDatabase();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );
    const balances = [] as number[];

    ctx = {
      connection,
      app,
      balances,
      users,
      spec: await Swagger.importSpecification(),
    };
  });

  describe('Check balance updates', async () => {
    it('caching is optional', async () => {
      await BalanceService.clearBalanceCache();
      ctx.users.forEach(async (element) => {
        ctx.balances[element.id] = await BalanceService.getBalance(element.id);
        expect(ctx.balances[element.id]).to.not.be.NaN;
      });
    });

    it('balances can be cached without changing them', async () => {
      await BalanceService.updateBalances();
      ctx.users.forEach(async (element) => {
        const balance = await BalanceService.getBalance(element.id);
        expect(balance).to.equal(ctx.balances[element.id]);
      });
    });
    it('balance can be cleared for specific users', async () => {
      await BalanceService.clearBalanceCache([ctx.users[0].id, ctx.users[1].id]);
      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance).to.equal(ctx.balances[ctx.users[0].id]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2).to.equal(ctx.balances[ctx.users[1].id]);
    });
    it('balance can be cached for specific users', async () => {
      await BalanceService.updateBalances([ctx.users[0].id, ctx.users[1].id]);
      const balance = await BalanceService.getBalance(ctx.users[0].id);
      expect(balance).to.equal(ctx.balances[ctx.users[0].id]);
      const balance2 = await BalanceService.getBalance(ctx.users[1].id);
      expect(balance2).to.equal(ctx.balances[ctx.users[1].id]);
    });

    it('balance is stable after transaction insert', async () => {
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
        transaction.subTransactions.forEach((subtransaction) => {
          const toId = subtransaction.to.id;
          subtransaction.subTransactionRows.forEach((subTransactionRow) => {
            const value = subTransactionRow.product.price.getAmount() * subTransactionRow.amount;
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
