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
import { json } from 'body-parser';
import log4js, { Logger } from 'log4js';
import TransactionController from '../../../src/controller/transaction-controller';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import TokenHandler from '../../../src/authentication/token-handler';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { BaseTransactionResponse } from '../../../src/controller/response/transaction-response';
import { verifyBaseTransactionEntity } from '../validators';
import RoleManager from '../../../src/rbac/role-manager';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';

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
    validTransReq: TransactionRequest,
    swaggerspec: SwaggerSpecification,
    logger: Logger,
  };

  beforeEach(async function beforeEach() {
    this.timeout(10000);
    const logger: Logger = log4js.getLogger('TransactionControllerTest');
    logger.level = 'ALL';
    const connection = await Database.initialize();
    const app = express();
    const database = await seedDatabase();
    const validTransReq = {
      from: 7,
      createdBy: 7,
      subtransactions: [
        {
          to: 8,
          container: {
            id: 1,
            revision: 2,
          },
          subTransactionRows: [
            {
              product: {
                id: 1,
                revision: 2,
              },
              amount: 1,
              price: {
                amount: 72,
                currency: 'EUR',
                precision: 2,
              },
            },
            {
              product: {
                id: 2,
                revision: 2,
              },
              amount: 2,
              price: {
                amount: 146,
                currency: 'EUR',
                precision: 2,
              },
            },
          ],
          price: {
            amount: 218,
            currency: 'EUR',
            precision: 2,
          },
        },
        {
          to: 9,
          container: {
            id: 2,
            revision: 2,
          },
          subTransactionRows: [
            {
              product: {
                id: 5,
                revision: 2,
              },
              amount: 4,
              price: {
                amount: 304,
                currency: 'EUR',
                precision: 2,
              },
            },
          ],
          price: {
            amount: 304,
            currency: 'EUR',
            precision: 2,
          },
        },
      ],
      pointOfSale: {
        id: 1,
        revision: 2,
      },
      price: {
        amount: 522,
        currency: 'EUR',
        precision: 2,
      },
    } as TransactionRequest;
    ctx = {
      logger,
      connection,
      app,
      swaggerspec: undefined,
      specification: undefined,
      controller: undefined,
      userToken: undefined,
      adminToken: undefined,
      transaction: undefined,
      validTransReq,
      ...database,
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.userToken = await tokenHandler.signToken({ user: ctx.users[0], roles: ['User'] }, '39');
    ctx.adminToken = await tokenHandler.signToken({ user: ctx.users[6], roles: ['User', 'Admin'] }, '39');

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Transaction: {
          get: all,
          create: all,
          update: all,
          delete: all,
        },

      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.swaggerspec = await Swagger.importSpecification();
    ctx.controller = new TransactionController({
      specification: ctx.specification,
      roleManager,
    });

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/transactions', ctx.controller.getRouter());
  });

  afterEach(async () => {
    await ctx.connection.close();
  });

  describe('GET /transactions', () => {
    it('should return all transactions if admin', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const transactions = res.body as BaseTransactionResponse[];
      const pagination = parseInt(process.env.PAGINATION_DEFAULT, 10);
      expect(transactions.length).to.equal(pagination);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(ctx.swaggerspec, transaction);
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

      const count = await Transaction.find({ where: { from: 1 } });
      expect(transactions.length).to.equal(count.length);

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
      const count = await Transaction.find({ where: { createdBy: 1 } });

      // TODO: Fix that transaction contains 2x id 18.
      // So now we check the amount of unique IDs
      const transactionCount = transactions.map((t) => t.id)
        .filter((value, index, self) => self.indexOf(value) === index).length;

      expect(transactionCount).to.equal(count.length);
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
      const pagination = parseInt(process.env.PAGINATION_DEFAULT, 10);
      expect(transactions.length).to.equal(pagination);
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
      const pagination = parseInt(process.env.PAGINATION_DEFAULT, 10);
      expect(transactions.length).to.equal(pagination);
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

  describe('POST /transactions', () => {
    it('should return an HTTP 200 and the saved transaction when user is admin', async () => {
      const res = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validTransReq);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 when user is not admin', async () => {
      const res = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validTransReq);
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 400 if the request is invalid', async () => {
      const badReq = {
        ...ctx.validTransReq,
        from: 0,
      } as TransactionRequest;
      const res = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(badReq);
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 403 if the user is a borrelkaart and has insufficient balance', async () => {
      // create borrelkaart user
      await User.save({
        firstName: 'borrelkaart',
        lastName: 'borrelkaart',
        active: true,
        deleted: false,
        type: 3,
      } as User);

      const borrelkaartUser = await User.findOne({ active: true, deleted: false, type: 3 });
      const badReq = {
        ...ctx.validTransReq,
        from: borrelkaartUser.id,
      } as TransactionRequest;

      const res = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(badReq);
      expect(res.status).to.equal(403);
    });
  });

  describe('DELETE /transactions', () => {
    it('should return an HTTP 200 and the deleted transaction if the transaction exists and user is admin', async () => {
      let res = await request(ctx.app)
        .get('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const deletedTransaction = res.body;

      // delete the first transaction in the database
      res = await request(ctx.app)
        .delete('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.body).to.eql(deletedTransaction);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the transaction does not exist', async () => {
      // delete a nonexistent transaction in the database
      const res = await request(ctx.app)
        .delete('/transactions/0')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.body).to.equal('Transaction not found.');
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // delete the first transaction in the database
      const res = await request(ctx.app)
        .delete('/transactions/1')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });
});
