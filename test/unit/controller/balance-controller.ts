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

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import TokenHandler from '../../../src/authentication/token-handler';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import BalanceController from '../../../src/controller/balance-controller';
import Transfer from '../../../src/entity/transactions/transfer';
import BalanceResponse, { PaginatedBalanceResponse } from '../../../src/controller/response/balance-response';
import { calculateBalance } from '../../helpers/balance';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import { OrderingDirection } from '../../../src/helpers/ordering';
import { PaginationResult } from '../../../src/helpers/pagination';
import Fine from '../../../src/entity/fine/fine';
import UserFineGroup from '../../../src/entity/fine/userFineGroup';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { FineSeeder, RbacSeeder, TransactionSeeder, TransferSeeder, UserSeeder } from '../../seed';

describe('BalanceController', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: BalanceController,
    userToken: string,
    adminToken: string,
    users: User[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
    fines: Fine[],
    userFineGroups: UserFineGroup[],
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const app = express();

    const users = await new UserSeeder().seed();
    const { transactions } = await new TransactionSeeder().seed(users, undefined, new Date('2020-02-12'), new Date('2022-11-30'));
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));
    const transfers = await new TransferSeeder().seed(users);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        Balance: {
          get: all,
          update: all,
        },

      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        Balance: {
          get: own,
          update: own,
        },

      },
      assignmentCheck: async () => true,
    }]);
    const roleManager = await new RoleManager().initialize();
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const userToken = await tokenHandler.signToken(await new RbacSeeder().getToken(users[0], roles), '33');
    const adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(users[6], roles), '33');

    const { fines, fineTransfers, userFineGroups, users: usersWithFines } = await new FineSeeder().seed(users, transactions, transfers, true);

    const specification = await Swagger.initialize(app);
    const controller = new BalanceController({
      specification,
      roleManager,
    });

    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/balances', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      userToken,
      adminToken,
      users: usersWithFines,
      transactions,
      subTransactions,
      transfers: transfers.concat(fineTransfers),
      fines,
      userFineGroups,
    };
  });

  describe('GET /balance/:id', () => {
    it('should return balance of self', async () => {
      const res = await request(ctx.app)
        .get('/balances')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification
        .validateModel('BalanceResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
    });

    it('should return forbidden when user is not admin', async () => {
      const res = await request(ctx.app)
        .get('/balances/2')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return 200 when user is admin', async () => {
      const res = await request(ctx.app)
        .get('/balances/2')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification
        .validateModel('BalanceResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.id).to.equal(2);
    });

    it('should return 404 when user does not exist', async () => {
      const res = await request(ctx.app)
        .get('/balances/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /balance/all', () => {
    it('should return correct model if admin', async () => {
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      body.records.forEach((balanceResponse) => {
        const validator = ctx.specification.validateModel('BalanceResponse', balanceResponse, false, true);
        expect(validator.valid).to.be.true;
        const user = ctx.users.find((u) => u.id === balanceResponse.id);
        expect(user).to.not.be.undefined;
        const actualBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers);
        expect(balanceResponse.amount.amount).to.equal(actualBalance.amount.getAmount());
      });
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should return balances based on date', async () => {
      const date = new Date(Math.ceil(
        ctx.transactions[Math.round(ctx.transactions.length / 2)].createdAt.getTime() / 1000) * 1000);
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ date: date.toISOString() });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      body.records.forEach((balanceResponse) => {
        const user = ctx.users.find((u) => u.id === balanceResponse.id);
        expect(user).to.not.be.undefined;
        const actualBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, date);
        expect(balanceResponse.amount.amount).to.equal(actualBalance.amount.getAmount());
      });
    });
    it('should adhere to allowDeleted parameter', async () => {
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ allowDeleted: true, take: 10000 });
      expect(res.status).to.equal(200);
      const body = res.body as PaginatedBalanceResponse;
      expect(body.records.length).to.equal(ctx.users.length);

      const res2 = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ allowDeleted: false, take: 10000 });
      expect(res2.status).to.equal(200);
      const body2 = res2.body as PaginatedBalanceResponse;
      expect(body2.records.length).to.equal(ctx.users.filter((u) => !u.deleted).length);
    });
    it('should return only balances satisfying minimum', async () => {
      const minBalance = 100;
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ minBalance, take: 10000 });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const actualBalances = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers))
        .filter((bal) => bal.amount.getAmount() >= minBalance);

      expect(body.records.length).to.equal(actualBalances.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(actualBalances.map((b) => b.user.id));
    });
    it('should return only balances satisfying maximum', async () => {
      const maxBalance = 100;
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ maxBalance });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const actualBalances = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers))
        .filter((bal) => bal.amount.getAmount() < maxBalance);

      expect(body.records.length).to.equal(actualBalances.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(actualBalances.map((b) => b.user.id));
    });
    it('should return only balances having fines', async () => {
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ hasFine: true });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const actualBalances = ctx.users
        .filter((u) => u.currentFines != null);

      expect(body.records.length).to.equal(actualBalances.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(actualBalances.map((u)=> u.id));
    });
    it('should return only balances satisfying minimum fine', async () => {
      const minFine = 600;
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ minFine, take: 10000 });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const users = ctx.userFineGroups
        .filter((u) => u.fines.reduce((sum, f) => sum + f.amount.getAmount(), 0) >= minFine);

      expect(body.records.length).to.equal(users.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(users.map((u) => u.user.id));
    });
    it('should return only balances satisfying maximum fine', async () => {
      const maxFine = 600;
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ maxFine, take: 10000 });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const users = ctx.userFineGroups
        .filter((u) => u.fines.reduce((sum, f) => sum + f.amount.getAmount(), 0) <= maxFine);

      expect(body.records.length).to.equal(users.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(users.map((u) => u.user.id));
    });
    it('should return only balances from certain user types', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.LOCAL_ADMIN];
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ userTypes: userTypes.map((t) => UserType[t]) });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const users = ctx.users.filter((u) => userTypes.includes(u.type));
      expect(body.records.length).to.equal(users.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(users.map((u) => u.id));
    });
    it('should return only balances from ADMIN type', async () => {
      const userTypes = [UserType.LOCAL_ADMIN];
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ userTypes: userTypes });
      expect(res.status).to.equal(200);
      const body = res.body as PaginatedBalanceResponse;
      const users = ctx.users.filter((u) => userTypes.includes(u.type));
      expect(body.records.length).to.equal(users.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(users.map((u) => u.id));
    });
    it('should return only balances from ADMIN type as string input', async () => {
      const userTypes = [UserType.LOCAL_ADMIN];
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ userTypes: ['LOCAL_ADMIN'] });
      expect(res.status).to.equal(200);
      const body = res.body as PaginatedBalanceResponse;
      const users = ctx.users.filter((u) => userTypes.includes(u.type));
      expect(body.records.length).to.equal(users.length);
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(users.map((u) => u.id));
    });
    it('should correctly order balance results on id', async () => {
      await Promise.all(Object.values(OrderingDirection).map(async (orderDirection: OrderingDirection) => {
        const res = await request(ctx.app)
          .get('/balances/all')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({ orderBy: 'id', orderDirection });
        expect(res.status).to.equal(200);

        const body = res.body as PaginatedBalanceResponse;
        expect(body.records).to.be.sortedBy('id', { descending: ['desc', 'DESC'].includes(orderDirection) });
      }));
    });
    it('should correctly order balance results on amount', async () => {
      await Promise.all(Object.values(OrderingDirection).map(async (orderDirection: OrderingDirection) => {
        const res = await request(ctx.app)
          .get('/balances/all')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({ orderBy: 'amount', orderDirection });
        expect(res.status).to.equal(200);

        const body = res.body as PaginatedBalanceResponse;
        expect(body.records.map((b) => b.amount)).to.be.sortedBy('amount', { descending: ['desc', 'DESC'].includes(orderDirection) });
      }));
    });
    it('should correctly return wall of shame', async () => {
      const res = await request(ctx.app)
        .get('/balances/all')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ orderBy: 'amount', orderDirection: OrderingDirection.ASC, maxBalance: 0 });
      expect(res.status).to.equal(200);

      const body = res.body as PaginatedBalanceResponse;
      const actualBalances = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers))
        .filter((bal) => bal.amount.getAmount() < 0);

      body.records.forEach((balanceResponse) => {
        expect(balanceResponse.amount.amount).to.be.lessThanOrEqual(0);
      });
      expect(body.records.map((b) => b.id)).to.deep.equalInAnyOrder(actualBalances.map((b) => b.user.id));
      expect(body.records.map((b) => b.amount)).to.be.ascendingBy('amount');
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/balances/all')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const balances = res.body.records as BalanceResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const count = ctx.users.length;
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(count);
      expect(balances.length).to.be.at.most(take);
    });
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });
});
