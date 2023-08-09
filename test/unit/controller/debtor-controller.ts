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
import { SwaggerSpecification } from 'swagger-model-validator';
import DebtorController from '../../../src/controller/debtor-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import {
  seedContainers, seedFines,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions, seedTransfers, seedUsers,
  seedVatGroups,
} from '../../seed';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Fine from '../../../src/entity/fine/fine';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import { json } from 'body-parser';
import fileUpload from 'express-fileupload';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { expect, request } from 'chai';
import FineHandoutEvent from '../../../src/entity/fine/fineHandoutEvent';
import {
  BaseFineHandoutEventResponse,
  FineHandoutEventResponse,
  UserToFineResponse,
} from '../../../src/controller/response/debtor-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { calculateBalance, calculateFine } from '../../helpers/balance';
import DebtorService from '../../../src/service/debtor-service';

describe('DebtorController', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: DebtorController,
    adminUser: User,
    localUser: User,
    adminToken: string;
    userToken: string;
    users: User[],
    productRevisions: ProductRevision[],
    containerRevisions: ContainerRevision[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
    transfersInclFines: Transfer[],
    fines: Fine[],
    fineHandoutEvents: FineHandoutEvent[],
  };

  before(async () => {
    // initialize test database
    const connection = await Database.initialize();

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2021-11-30'), 10);
    const transfers = await seedTransfers(users, new Date('2020-02-12'), new Date('2021-11-30'));
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));
    const { fines, fineTransfers, fineHandoutEvents } = await seedFines(users, transactions, transfers);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const userToken = await tokenHandler.signToken({ user: localUser, roles: [], lesser: false }, 'nonce');

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Fine: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new DebtorController({ specification, roleManager });
    app.use(json());
    app.use(fileUpload());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/fines', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      userToken,
      users,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers,
      transfersInclFines: transfers.concat(fineTransfers),
      fines,
      fineHandoutEvents,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('GET /fines', () => {
    it('should correctly return all fine handout events', async () => {
      const res = await request(ctx.app)
        .get('/fines')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const events = res.body.records as BaseFineHandoutEventResponse[];
      const pagination = res.body._pagination as PaginationResult;

      expect(events.length).to.equal(ctx.fineHandoutEvents.length);
      events.forEach((event) => {
        const validation = ctx.specification.validateModel('BaseFineHandoutResponse', event, false, true);
        expect(validation.valid).to.be.true;
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.fineHandoutEvents.length);
    });
    it('should return fine handout events in order from newest to oldest', async () => {
      const res = await request(ctx.app)
        .get('/fines')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const events = res.body.records as BaseFineHandoutEventResponse[];
      expect(events).to.be.sortedBy('createdAt', { descending: true });
    });
    it('should return forbidden if not admin', async () => {
      const res = await request(ctx.app)
        .get('/fines')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('GET /fines/{id}', () => {
    it('should correctly return single fine handout event', async () => {
      const fineHandoutEvent = ctx.fineHandoutEvents[0];
      const res = await request(ctx.app)
        .get(`/fines/${fineHandoutEvent.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const fineHandoutEventResponse = res.body as FineHandoutEventResponse;

      const validation = ctx.specification.validateModel('FineHandoutResponse', fineHandoutEventResponse, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should include all fines', async () => {
      const fineHandoutEvent = ctx.fineHandoutEvents[0];
      const fines = ctx.fines.filter((fine) => fine.fineHandoutEvent.id === fineHandoutEvent.id);
      const res = await request(ctx.app)
        .get(`/fines/${fineHandoutEvent.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const fineHandoutEventResponse = res.body as FineHandoutEventResponse;
      expect(fineHandoutEventResponse.fines.length).to.equal(fines.length);
      fineHandoutEventResponse.fines.forEach((fine) => {
        const validation = ctx.specification.validateModel('FineResponse', fine, false, true);
        expect(validation.valid).to.be.true;
      });
    });
    it('should return forbidden if not admin', async () => {
      const fineHandoutEvent = ctx.fineHandoutEvents[0];
      const res = await request(ctx.app)
        .get(`/fines/${fineHandoutEvent.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('GET /fines/eligible', () => {
    it('should correctly return list of possible fines', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.MEMBER];
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({ userTypes: userTypes.map((t) => UserType[t]) })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const fines = res.body as UserToFineResponse[];
      fines.forEach((fine) => {
        const validation = ctx.specification.validateModel('UserToFineResponse', fine, false, true);
        expect(validation.valid).to.be.true;
      });
    });
    it('should correctly return list of possible fines for user types', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.MEMBER];
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({ userTypes: userTypes.map((t) => UserType[t]) })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const fines = res.body as UserToFineResponse[];
      fines.forEach((f) => {
        const user = ctx.users.find((u) => u.id === f.id);
        expect(userTypes).to.include(user.type);
      });
    });
    it('should return 400 when userType is not an array', async () => {
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({ userTypes: '39Vooooo' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });
    it('should return 400 when userType is not a valid array', async () => {
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({ userTypes: ['39Voooo'] })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });
    it('should return list of fines based on reference date', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.MEMBER];
      const referenceDate = new Date('2021-02-12');
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({
          userTypes: userTypes.map((t) => UserType[t]),
          referenceDate: referenceDate.toISOString(),
        })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const fines = res.body as UserToFineResponse[];
      fines.forEach((f) => {
        const user = ctx.users.find((u) => u.id === f.id);
        expect(user).to.not.be.undefined;
        const balance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, referenceDate).amount.getAmount();
        expect(f.amount.amount).to.equal(calculateFine(balance));
      });
    });
    it('should return 400 when referenceDate is not a valid date', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.MEMBER];
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({
          userTypes: userTypes.map((t) => UserType[t]),
          referenceDate: '39Vooooo',
        })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });
    it('should return 403 if not admin', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.MEMBER];
      const res = await request(ctx.app)
        .get('/fines/eligible')
        .query({ userTypes: userTypes.map((t) => UserType[t]) })
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('POST /fines/handout', () => {
    it('should correctly hand out fines to given users', async () => {
      const res = await request(ctx.app)
        .post('/fines/handout')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ userIds: ctx.users.map((u) => u.id) });
      expect(res.status).to.equal(200);

      const fineHandoutEventResponse = res.body as FineHandoutEventResponse;

      const validation = ctx.specification.validateModel('FineHandoutResponse', fineHandoutEventResponse, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should return 403 if user is not admin', async () => {
      const res = await request(ctx.app)
        .post('/fines/handout')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ userIds: ctx.users.map((u) => u.id) });
      expect(res.status).to.equal(403);
    });
    it('should return 400 if userIds is not a list', async () => {
      const res = await request(ctx.app)
        .post('/fines/handout')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ userIds: '39Vooo' });
      expect(res.status).to.equal(400);
    });
    it('should return 400 if list of userIds is invalid', async () => {
      const res = await request(ctx.app)
        .post('/fines/handout')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ userIds: ['WieDitLeestTrektBak'] });
      expect(res.status).to.equal(400);
    });
    it('should return 200 and empty list of fines if no userIds given', async () => {
      const res = await request(ctx.app)
        .post('/fines/handout')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ userIds: [] });
      expect(res.status).to. equal(200);

      const fineHandoutEventResponse = res.body as FineHandoutEventResponse;
      expect(fineHandoutEventResponse.fines.length).to.equal(0);
    });
  });
});
