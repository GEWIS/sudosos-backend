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
import log4js, { Logger } from 'log4js';
import TransactionController from '../../../src/controller/transaction-controller';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import TokenHandler from '../../../src/authentication/token-handler';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { BaseTransactionResponse } from '../../../src/controller/response/transaction-response';
import { verifyBaseTransactionEntity } from '../validators';
import RoleManager from '../../../src/rbac/role-manager';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import { defaultPagination, PAGINATION_DEFAULT, PaginationResult } from '../../../src/helpers/pagination';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import dinero from 'dinero.js';
import { RbacSeeder } from '../../seed';

describe('TransactionController', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: TransactionController,
    userToken: string,
    adminToken: string,
    organMemberToken: string,
    organ: User,
    transaction: Transaction,
    users: User[],
    transactions: Transaction[],
    validTransReq: TransactionRequest,
    swaggerspec: SwaggerSpecification,
    logger: Logger,
    tokenHandler: TokenHandler,
  };

  // eslint-disable-next-line func-names
  before(async function test(): Promise<void> {
    this.timeout(50000);
    const logger: Logger = log4js.getLogger('TransactionControllerTest');
    logger.level = 'ALL';
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const app = express();
    const database = await seedDatabase();
    const { users, pointOfSaleRevisions } = database;

    const pos = pointOfSaleRevisions.filter((p) => p.pointOfSale.deletedAt == null)[0];
    const conts = pos.containers.filter((c) => c.container.deletedAt == null).slice(0, 2);
    const products = conts.map((c) => c.products.filter((p) => p.product.deletedAt == null).slice(0, 2));
    const validTransReq: TransactionRequest = {
      from: users[6].id,
      createdBy: users[6].id,
      subTransactions: conts.map((c, i) => (
        {
          to: c.container.owner.id,
          container: {
            id: c.containerId,
            revision: c.revision,
          },
          subTransactionRows: products[i].map((p, i2) => (
            {
              product: {
                id: p.productId,
                revision: p.revision,
              },
              amount: i2 + 1,
              totalPriceInclVat: p.priceInclVat.multiply(i2 + 1).toObject(),
            }
          )),
          totalPriceInclVat: products[i].reduce((total, p, i2) => total
            .add(p.priceInclVat.multiply(i2 + 1)), dinero({ amount: 0 })).toObject(),
        }
      )),
      pointOfSale: {
        id: pos.pointOfSaleId,
        revision: pos.revision,
      },
      totalPriceInclVat: products.reduce((total1, prods) => total1
        .add(prods.reduce((total2, p, i) => total2
          .add(p.priceInclVat.multiply(i + 1)), dinero({ amount: 0 })),
        ), dinero({ amount: 0 })).toObject(),
    };
    ctx = {
      logger,
      connection,
      app,
      organ: undefined,
      swaggerspec: undefined,
      specification: undefined,
      controller: undefined,
      userToken: undefined,
      adminToken: undefined,
      organMemberToken: undefined,
      transaction: undefined,
      tokenHandler: undefined,
      validTransReq,
      ...database,
    };

    ctx.tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']), organ: new Set<string>(['*']) };
    const organRole = { organ: new Set<string>(['*']) };

    const roles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        Transaction: {
          get: all,
          create: all,
          update: all,
          delete: all,
        },
        Balance: {
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'Buyer',
      permissions: {
        Transaction: {
          get: own,
          create: own,
        },
        Balance: {
          update: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    }, {
      name: 'Seller',
      permissions: {
        Transaction: {
          get: organRole,
        },
        Balance: {
          update: organRole,
        },
      },
      assignmentCheck: async (user) => user.id === ctx.users[7].id,
    }]);
    const roleManager = await new RoleManager().initialize();

    ctx.userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(ctx.users[0], roles), '39');
    ctx.adminToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(ctx.users[6], roles), '39');
    ctx.organMemberToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(ctx.users[1], roles, [ctx.users[0]]), '1');

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.swaggerspec = await Swagger.importSpecification();
    ctx.controller = new TransactionController({
      specification: ctx.specification,
      roleManager,
    });

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({
      tokenHandler: ctx.tokenHandler,
      refreshFactor: 0.5,
    }).getMiddleware());
    ctx.app.use('/transactions', ctx.controller.getRouter());
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /transactions', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedBaseTransactionResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });

    it('should return all transactions if admin', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const transactions = res.body.records as BaseTransactionResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(transactions.length).to.equal(pagination.take);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(ctx.swaggerspec, transaction);
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.transactions.length);
    });

    it('should return forbidden when user is not admin', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return return correct transactions when fromId param is set', async () => {
      const fromId = 1;

      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromId });
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions.filter(
        (transaction) => transaction.from.id === fromId,
      );

      const transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(actualTransactions.length);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
        expect(transaction.from.id).to.equal(fromId);
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
      const createdById = 1;

      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ createdById });
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions.filter(
        (transaction) => transaction.createdBy.id === createdById,
      );

      const transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(actualTransactions.length);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
        expect(transaction.createdBy.id).to.equal(createdById);
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
      const toId = 7;

      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ toId });
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions
        .filter((transactions) => transactions.subTransactions
          .some((subTransaction) => subTransaction.to.id === toId));

      const transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(actualTransactions.length);
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

      let transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      const pagination = parseInt(process.env.PAGINATION_DEFAULT, 10) || PAGINATION_DEFAULT;
      expect(transactions.length).to.equal(pagination);
      transactions.forEach((t) => {
        verifyBaseTransactionEntity(spec, t);
        expect(new Date(t.createdAt)).to.be.greaterThan(fromDate);
      });

      fromDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate });
      expect(res.status).to.equal(200);
      transactions = res.body.records as BaseTransactionResponse[];

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

      let transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      const pagination = parseInt(process.env.PAGINATION_DEFAULT, 10) || PAGINATION_DEFAULT;
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
      transactions = res.body.records as BaseTransactionResponse[];

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
      const productId = 44;

      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productId });
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.subTransactionRows
            .some((subTransactionRow) => subTransactionRow.product.product.id === productId)));

      const transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(actualTransactions.length);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });
    });

    it('should return correct transactions when productId and productRevision are set', async () => {
      const productId = 44;
      const productRevision = 2;

      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ productId, productRevision });
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.subTransactionRows
            .some((subTransactionRow) => subTransactionRow.product.product.id === productId
              && subTransactionRow.product.revision === productRevision)));

      const transactions = res.body.records as BaseTransactionResponse[];
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(actualTransactions.length);
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
      const take = 30;
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ take });
      expect(res.status).to.equal(200);

      const transactions = res.body.records as BaseTransactionResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      const spec = await Swagger.importSpecification();
      expect(transactions.length).to.equal(take);
      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.transactions.length);
    });

    it('should return 400 when take is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ take: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should adhere to pagination skip', async () => {
      const skip = 180;
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ skip });
      expect(res.status).to.equal(200);

      const transactions = res.body.records as BaseTransactionResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      const spec = await Swagger.importSpecification();

      transactions.forEach((transaction: BaseTransactionResponse) => {
        verifyBaseTransactionEntity(spec, transaction);
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(ctx.transactions.length);
    });

    it('should return 400 when skip is not a number', async () => {
      const res = await request(ctx.app)
        .get('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ skip: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /transactions/{id}', () => {
    it('should return HTTP 200 and transaction if connected via organ', async () => {
      const trans = await Transaction.findOne({ relations: ['from'], where: { from: { id: ctx.users[0].id } } });
      expect(trans).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/transactions/${trans.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);
      expect(res.status).to.equal(200);
      // TODO Fix disallowExtraProperties to be `true`
      //  See https://github.com/GEWIS/sudosos-backend/issues/117
      const valid = ctx.specification.validateModel(
        'TransactionResponse',
        res.body,
        false,
        false);
      expect(valid.valid).to.be.true;
      expect(res.body.id).to.equal(trans.id);
    });
    it('should return HTTP 200 for own transaction', async () => {
      const trans = await Transaction.findOne({ relations: ['from'], where: { from: { id: ctx.users[0].id } } });
      expect(trans).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/transactions/${trans.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.id).to.equal(trans.id);
    });
    it('should return HTTP 403 if not admin and not connected via organ', async () => {
      const trans = await Transaction.findOne({ relations: ['from'], where: { from: { id: ctx.users[3].id } } });
      expect(trans).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/transactions/${trans.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('POST /transactions', () => {
    it('should return an HTTP 200 and the saved transaction when user is admin', async () => {
      const res = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validTransReq);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'TransactionResponse',
        res.body,
        false,
        false,
      ).valid).to.be.true;
    });
    it('should return an HTTP 403 if user is not connected to createdBy via organ', async () => {
      await inUserContext(await (await UserFactory()).clone(2),
        async (user: User, otherUser: User) => {
          const canBuyToken = await ctx.tokenHandler.signToken({ user, roles: ['Buyer'], lesser: false }, '39');
          const req : TransactionRequest = {
            ...ctx.validTransReq,
            createdBy: otherUser.id,
            from: user.id,
          };
          const res = await request(ctx.app)
            .post('/transactions')
            .set('Authorization', `Bearer ${canBuyToken}`)
            .send(req);
          expect(res.status).to.equal(403);
        });
    });
    it('should return an HTTP 200 and the saved transaction when user is connected to createdBy via organ', async () => {
      await inUserContext(await (await UserFactory()).clone(2),
        async (user: User, otherUser: User) => {
          await (Object.assign(new MemberAuthenticator(), {
            user,
            authenticateAs: ctx.users[0],
          })).save();
          await (Object.assign(new MemberAuthenticator(), {
            user: otherUser,
            authenticateAs: ctx.users[0],
          })).save();

          const canBuyToken = await ctx.tokenHandler.signToken({ user, roles: ['Buyer'], lesser: false }, '39');
          const req : TransactionRequest = {
            ...ctx.validTransReq,
            createdBy: otherUser.id,
            from: user.id,
          };
          const res = await request(ctx.app)
            .post('/transactions')
            .set('Authorization', `Bearer ${canBuyToken}`)
            .send(req);
          expect(res.status).to.equal(200);
        });
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
    it('should return an HTTP 403 if the user has insufficient balance and cannot go into debt', async () => {
      // create voucher user
      await User.save({
        firstName: 'voucher',
        lastName: 'voucher',
        active: true,
        deleted: false,
        type: UserType.VOUCHER,
        acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
        canGoIntoDebt: false,
      } as User);

      const voucherUser = await User.findOne({
        where: { active: true, deleted: false, type: UserType.VOUCHER },
      });
      const badReq = {
        ...ctx.validTransReq,
        from: voucherUser.id,
      } as TransactionRequest;

      const res = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(badReq);
      expect(res.status).to.equal(403);
      expect(res.body).to.equal('Insufficient balance.');
    });
  });

  describe('PATCH /transactions', () => {
    it('should return an HTTP 200 and the updated transaction if the transaction is valid and user is admin', async () => {
      let res = await request(ctx.app)
        .get('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const toUpdate = res.body;

      // update the first transaction in the database
      res = await request(ctx.app)
        .patch('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validTransReq);
      expect(ctx.specification.validateModel(
        'TransactionResponse',
        res.body,
        false,
        false,
      ).valid).to.be.true;

      expect(res.body).to.not.eql(toUpdate);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if the request is invalid', async () => {
      let res = await request(ctx.app)
        .get('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const toUpdate = res.body;

      // incorrectly update the first transaction in the database
      const badReq = {
        ...ctx.validTransReq,
        from: 0,
      } as TransactionRequest;

      res = await request(ctx.app)
        .patch('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(badReq);
      expect(res.status).to.equal(400);

      // check if vtransaction indeed not updated
      res = await request(ctx.app)
        .get('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.body).to.eql(toUpdate);
    });
    it('should return an HTTP 404 if the transaction does not exist', async () => {
      // update a nonexistent transaction in the database
      const res = await request(ctx.app)
        .patch('/transactions/0')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validTransReq);
      expect(res.body).to.equal('Transaction not found.');
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // update a transaction in the database with non admin token
      const res = await request(ctx.app)
        .patch('/transactions/1')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validTransReq);
      expect(res.status).to.equal(403);
    });
  });

  describe('DELETE /transactions', () => {
    it('should return an HTTP 204 if the transaction exists and user is admin', async () => {
      let res = await request(ctx.app)
        .get('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // delete the first transaction in the database
      res = await request(ctx.app)
        .delete('/transactions/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.body).to.be.empty;
      expect(res.status).to.equal(204);
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
  describe('POST /transactions/validate', () => {
    it('should return an HTTP 200 when the transaction is valid', async () => {
      const res = await request(ctx.app)
        .post('/transactions/validate')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validTransReq);
      expect(res.status).to.equal(200);
      expect(res.body).to.equal(true);
    });
    it('should return HTTP 400 if the transaction is not valid', async () => {
      const badReq : TransactionRequest = {
        ...ctx.validTransReq,
        from: 0,
      };
      const res = await request(ctx.app)
        .post('/transactions/validate')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(badReq);
      expect(res.body).to.equal('Transaction is invalid');
      expect(res.status).to.equal(400);
    });

  });
});
