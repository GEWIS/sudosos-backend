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
import express, { Application } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import bodyParser from 'body-parser';
import TransactionController from '../../../src/controller/transaction-controller';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import TokenHandler from '../../../src/authentication/token-handler';
import User from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { BaseTransactionResponse } from '../../../src/controller/response/transaction-response';
import { verifyBaseTransactionEntity } from '../validators';
import RoleManager from '../../../src/rbac/role-manager';

describe('TransactionController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: TransactionController,
    userToken: string,
    adminToken: string,
    transaction: Transaction,
    users: User[],
    transactions: Transaction[],
  };

  before(async function (): Promise<void> {
    // @ts-ignore
    this.timeout(10000);
    const connection = await Database.initialize();
    const app = express();
    const database = await seedDatabase();
    ctx = {
      connection,
      app,
      specification: undefined,
      controller: undefined,
      userToken: undefined,
      adminToken: undefined,
      transaction: undefined,
      ...database,
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.userToken = await tokenHandler.signToken({ user: ctx.users[0], roles: ['User'] }, '39');
    ctx.adminToken = await tokenHandler.signToken({ user: ctx.users[6], roles: ['User', 'Admin'] }, '39');

    // const all = { all: new Set<string>(['*']) };
    // const own = { own: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    // roleManager.registerRole({
    //   name: 'Admin',
    //   permissions: {
    //     User: {
    //       create: all,
    //       get: all,
    //       update: all,
    //       delete: all,
    //     },
    //     Product: {
    //       get: all,
    //       update: all,
    //     },
    //
    //   },
    //   assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    // });
    // roleManager.registerRole({
    //   name: 'User',
    //   permissions: {
    //     User: {
    //       get: own,
    //     },
    //     Product: {
    //       get: own,
    //       update: own,
    //     },
    //   },
    //   assignmentCheck: async () => true,
    // });

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new TransactionController({
      specification: ctx.specification,
      roleManager,
    });

    ctx.app.use(bodyParser.json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/transactions', ctx.controller.getRouter());
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /transactions', () => {
    it('should return all transactions if admin', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(24);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return forbidden when user is not admin', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return return correct transactions when fromId param is set', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromId: 1 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(9);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
        expect(transaction.from.id).to.equal(1);
      });
    });

    it('should return 400 when fromId is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromId: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return return correct transactions when createdById param is set', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ createdById: 1 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(14);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
        expect(transaction.createdBy.id).to.equal(1);
      });
    });

    it('should return 400 when createdById is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ createdById: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return return correct transactions when toId param is set', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ toId: 7 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(17);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return 400 when toId is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ toId: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return correct transactions when fromDate is set', async () => {
      let fromDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      let res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate });
      expect(res.status).to.equal(200);

      let transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(24);
      transactions.map((t) => {
        verifyBaseTransactionEntity(spec, t);
        expect(new Date(t.createdAt)).to.be.greaterThan(fromDate);
        return undefined;
      });

      fromDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate });
      expect(res.status).to.equal(200);
      transactions = res.body as BaseTransactionResponse[];

      expect(transactions.length).to.equal(0);
    });

    it('should return 400 when fromDate is not a date', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return correct transactions when tillDate is set', async () => {
      let tillDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      let res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ tillDate });
      expect(res.status).to.equal(200);

      let transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(24);
      transactions.map((t) => {
        verifyBaseTransactionEntity(spec, t);
        expect(new Date(t.createdAt)).to.be.lessThan(tillDate);
        return undefined;
      });

      tillDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ tillDate });
      expect(res.status).to.equal(200);
      transactions = res.body as BaseTransactionResponse[];

      expect(transactions.length).to.equal(0);
    });

    it('should return 400 when tillDate is not a date', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ tillDate: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return correct transactions when productId is set', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productId: 44 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(5);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return correct transactions when productId and productRevision are set', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productId: 44, productRevision: 2 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(2);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return 400 when only productRevision is set', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productRevision: 2 });
      expect(res.status).to.equal(400);
    });

    it('should return 400 when productId is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productId: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return 400 when productRevision is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productId: 44, productRevision: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should adhere to pagination take', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ take: 30 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(30);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return 400 when take is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ take: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should adhere to pagination skip', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ skip: 212 });
      expect(res.status).to.equal(200);

      const transactions = res.body as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(12);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return 400 when skip is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ skip: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });
  });
});
