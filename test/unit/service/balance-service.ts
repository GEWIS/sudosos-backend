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
import TransactionService from '../../../src/service/transaction-service';
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
    this.timeout(5000);
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
      BalanceService.clearBalanceCache();
      ctx.users.forEach(async (element) => {
        ctx.balances[element.id] = await BalanceService.getBalance(element.id);
        expect(ctx.balances[element.id]).to.not.be.NaN;
      });
    });

    it('balances can be cached without changing them', async () => {
      BalanceService.updateBalances();
      ctx.users.forEach(async (element) => {
        const balance = await BalanceService.getBalance(element.id);
        expect(balance).to.equal(ctx.balances[element.id]);
      });
    });
    it('balance can be cleared for specific users', async () => {
      BalanceService.clearBalanceCache([1, 2]);
      const balance = await BalanceService.getBalance(1);
      expect(balance).to.equal(ctx.balances[1]);
      const balance2 = await BalanceService.getBalance(2);
      expect(balance2).to.equal(ctx.balances[2]);
    });
    it('balance can be cached for specific users', async () => {
      BalanceService.updateBalances([1, 2]);
      const balance = await BalanceService.getBalance(1);
      expect(balance).to.equal(ctx.balances[1]);
      const balance2 = await BalanceService.getBalance(2);
      expect(balance2).to.equal(ctx.balances[2]);
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

      await Transaction.save(transactions[0]);
      const transactionWithValue = await TransactionService
        .getSingleTransaction(transactions[0].id);

      const newBalance = await BalanceService.getBalance(1);

      // check new balance is old balance minus transaction value
      expect(newBalance).to.equal(ctx.balances[ctx.users[0].id] - transactionWithValue.value.amount);

      let newTotalBalance = 0;
      const answers = await Promise.all(ctx.users.map(async (user) => BalanceService.getBalance(user.id)));
      newTotalBalance = answers.reduce((a, b) => a + b, 0);

      expect(newTotalBalance).to.equal(ctx.balances.reduce((a, b) => a + b, 0));
    });

    after(async () => {
      await ctx.connection.close();
    });
  });
});
