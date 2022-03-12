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
import { json } from 'body-parser';
import { expect, request } from 'chai';
import PayoutRequestController from '../../../src/controller/payout-request-controller';
import User, { UserType } from '../../../src/entity/user/user';
import PayoutRequest from '../../../src/entity/transactions/payout-request';
import Database from '../../../src/database/database';
import { seedPayoutRequests, seedUsers } from '../../seed';
import PayoutRequestRequest from '../../../src/controller/request/payout-request-request';
import TokenHandler from '../../../src/authentication/token-handler';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import {
  BasePayoutRequestResponse,
  PayoutRequestResponse,
} from '../../../src/controller/response/payout-request-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { PayoutRequestState } from '../../../src/entity/transactions/payout-request-status';

describe('PayoutRequestController', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: PayoutRequestController,
    userToken: string,
    adminToken: string,
    users: User[],
    adminUser: User,
    localUser: User,
    payoutRequests: PayoutRequest[],
    validPayoutRequestRequest: PayoutRequestRequest,
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const payoutRequests = await seedPayoutRequests(users);

    const adminUser = users.filter((u) => u.type === UserType.LOCAL_ADMIN)[0];
    const localUser = users.filter((u) => u.type === UserType.LOCAL_USER)[0];

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const userToken = await tokenHandler.signToken({ user: localUser, roles: ['User'], lesser: false }, 'nonce');

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };

    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        payoutRequest: {
          get: all,
          create: own,
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });
    roleManager.registerRole({
      name: 'User',
      permissions: {
        payoutRequest: {
          get: own,
          create: own,
          update: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });

    const controller = new PayoutRequestController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/payoutrequests', controller.getRouter());

    const validPayoutRequestRequest: PayoutRequestRequest = {
      amount: {
        amount: 3900,
        precision: 2,
        currency: 'EUR',
      },
      bankAccountNumber: 'NL22 ABNA 0528195913',
      bankAccountName: 'Studievereniging GEWIS',
    };

    ctx = {
      connection,
      app,
      specification,
      controller,
      users,
      adminUser,
      localUser,
      payoutRequests,
      adminToken,
      userToken,
      validPayoutRequestRequest,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /payoutrequests', () => {
    it('should return all payout requests if admin', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const payoutRequests = res.body.records as BasePayoutRequestResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(payoutRequests.length).to.equal(pagination.take);
      payoutRequests.forEach((req) => {
        const validation = ctx.specification.validateModel('BasePayoutRequestResponse', req, false, true);
        expect(validation.valid).to.be.true;
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.payoutRequests.length);
    });

    it('should return forbidden if user not admin', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return correct payout requests when single requestedById is set', async () => {
      const requestedById = ctx.payoutRequests[0].requestedBy.id;
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ requestedById });
      expect(res.status).to.equal(200);

      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => req.requestedBy.id === requestedById);
      const payoutRequests = res.body.records as BasePayoutRequestResponse[];

      expect(payoutRequests.length).to.equal(actualPayoutRequests.length);
      payoutRequests.forEach((req) => {
        expect(req.requestedBy.id).to.equal(requestedById);
      });
    });

    it('should return correct payout requests when multiple requestedByIds are set', async () => {
      const ids = Array.from(new Set(ctx.payoutRequests.map((req) => req.requestedBy.id)));
      const requestedById = ids.slice(0, 3);
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ requestedById });
      expect(res.status).to.equal(200);

      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => requestedById.includes(req.requestedBy.id));
      const payoutRequests = res.body.records as BasePayoutRequestResponse[];

      expect(payoutRequests.length).to.equal(actualPayoutRequests.length);
      payoutRequests.forEach((req) => {
        expect(requestedById).to.include(req.requestedBy.id);
      });
    });

    it('should return 400 when requestedBy is a string', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ requestedById: 'yee' });
      expect(res.status).to.equal(400);
    });

    it('should return correct payout requests when single approvedById is set', async () => {
      const approvedById = ctx.payoutRequests.filter(
        (req) => req.approvedBy !== undefined,
      )[0].approvedBy.id;
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ approvedById });
      expect(res.status).to.equal(200);

      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => req.approvedBy !== undefined && req.approvedBy.id === approvedById);
      const payoutRequests = res.body.records as BasePayoutRequestResponse[];

      expect(payoutRequests.length).to.equal(actualPayoutRequests.length);
      payoutRequests.forEach((req) => {
        expect(req.approvedBy.id).to.equal(approvedById);
      });
    });

    it('should return correct payout requests when multiple approvedByIds are set', async () => {
      const ids = Array.from(new Set(ctx.payoutRequests.filter(
        (req) => req.approvedBy !== undefined,
      ).map((req) => req.approvedBy.id)));
      const approvedById = ids.slice(0, 3);
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ approvedById });
      expect(res.status).to.equal(200);

      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => req.approvedBy !== undefined && approvedById.includes(req.approvedBy.id));
      const payoutRequests = res.body.records as BasePayoutRequestResponse[];

      expect(payoutRequests.length).to.equal(actualPayoutRequests.length);
      payoutRequests.forEach((req) => {
        expect(approvedById).to.include(req.approvedBy.id);
      });
    });

    it('should return 400 when approvedById is a string', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ approvedById: 'yee' });
      expect(res.status).to.equal(400);
    });

    it('should return correct transactions when fromDate is set', async () => {
      let fromDate = new Date(ctx.payoutRequests[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      let res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate });
      expect(res.status).to.equal(200);

      let payoutRequests = res.body.records as BasePayoutRequestResponse[];
      expect(payoutRequests.length).to
        .equal(Math.min(defaultPagination(), ctx.payoutRequests.length));
      payoutRequests.forEach((req) => {
        expect(new Date(req.createdAt)).to.be.greaterThan(fromDate);
      });

      fromDate = new Date(ctx.payoutRequests[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate });
      expect(res.status).to.equal(200);
      payoutRequests = res.body.records as BasePayoutRequestResponse[];

      expect(payoutRequests.length).to.equal(0);
    });

    it('should return 400 when fromDate is not a date', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should return correct transactions when tillDate is set', async () => {
      let tillDate = new Date(ctx.payoutRequests[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      let res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ tillDate });
      expect(res.status).to.equal(200);

      let payoutRequests = res.body.records as BasePayoutRequestResponse[];
      expect(payoutRequests.length).to
        .equal(Math.min(defaultPagination(), ctx.payoutRequests.length));
      payoutRequests.forEach((req) => {
        expect(new Date(req.createdAt)).to.be.lessThan(tillDate);
      });

      tillDate = new Date(ctx.payoutRequests[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ tillDate });
      expect(res.status).to.equal(200);
      payoutRequests = res.body.records as BasePayoutRequestResponse[];

      expect(payoutRequests.length).to.equal(0);
    });

    it('should return 400 when tillDate is not a date', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ tillDate: 'Wie dit leest trekt een bak' });
      expect(res.status).to.equal(400);
    });

    it('should correctly filter on single status', async () => {
      const status = [PayoutRequestState.CREATED];
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ status });
      expect(res.status).to.equal(200);

      const payoutRequests = res.body.records as BasePayoutRequestResponse[];
      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => {
          if (req.payoutRequestStatus.length === 0) return false;
          return status.includes(req.payoutRequestStatus
            .sort((a, b) => (
              a.createdAt.getTime() < b.createdAt.getTime() ? 1 : -1))[0].state);
        });

      expect(payoutRequests.length).to
        .equal(Math.min(defaultPagination(), actualPayoutRequests.length));
      payoutRequests.forEach((req) => {
        expect(status).to.include(req.status);
      });
    });

    it('should correctly filter on multiple statuses', async () => {
      const status = [PayoutRequestState.APPROVED, PayoutRequestState.DENIED];
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ status });
      expect(res.status).to.equal(200);

      const payoutRequests = res.body.records as BasePayoutRequestResponse[];
      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => {
          if (req.payoutRequestStatus.length === 0) return false;
          return status.includes(req.payoutRequestStatus
            .sort((a, b) => (
              a.createdAt.getTime() < b.createdAt.getTime() ? 1 : -1))[0].state);
        });

      expect(payoutRequests.length).to.equal(actualPayoutRequests.length);
      payoutRequests.forEach((req) => {
        expect(status).to.include(req.status);
      });
    });

    it('should return 400 when status is not a valid PayoutRequestState', async () => {
      const res = await request(ctx.app)
        .get('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ status: 'Yeeeee' });
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /payoutrequests/{id}', () => {
    it('should correctly return a payout request response', async () => {
      const { id } = ctx.payoutRequests[0];
      const res = await request(ctx.app)
        .get(`/payoutrequests/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const payoutRequest = res.body as PayoutRequestResponse;

      const validation = ctx.specification.validateModel('PayoutRequestResponse', payoutRequest, false, true);
      expect(validation.valid).to.be.true;
    });

    it('should correctly return own payout request', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.requestedBy.id === ctx.localUser.id)[0];
      const res = await request(ctx.app)
        .get(`/payoutrequests/${id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      const payoutRequest = res.body as PayoutRequestResponse;

      const validation = ctx.specification.validateModel('PayoutRequestResponse', payoutRequest, false, true);
      expect(validation.valid).to.be.true;
    });

    it("should return 403 if requesting someone else's payout request and not admin", async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.requestedBy.id !== ctx.localUser.id)[0];
      const res = await request(ctx.app)
        .get(`/payoutrequests/${id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return 404 if payout request does not exist', async () => {
      const id = ctx.payoutRequests[ctx.payoutRequests.length - 1].id + 1000;
      const res = await request(ctx.app)
        .get(`/payoutrequests/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /payoutrequests', () => {
    it('should correctly create payout request if admin', async () => {
      const countBefore = await PayoutRequest.count();
      const res = await request(ctx.app)
        .post('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validPayoutRequestRequest);
      expect(res.status).to.equal(200);

      const payoutRequest = res.body as PayoutRequestResponse;

      const validation = ctx.specification.validateModel('PayoutRequestResponse', payoutRequest, false, true);
      expect(validation.valid).to.be.true;
      expect(await PayoutRequest.count()).to.equal(countBefore + 1);
    });

    it('should correctly create payout request if user', async () => {
      const countBefore = await PayoutRequest.count();
      const res = await request(ctx.app)
        .post('/payoutrequests')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validPayoutRequestRequest);
      expect(res.status).to.equal(200);

      const payoutRequest = res.body as PayoutRequestResponse;

      const validation = ctx.specification.validateModel('PayoutRequestResponse', payoutRequest, false, true);
      expect(validation.valid).to.be.true;
      expect(await PayoutRequest.count()).to.equal(countBefore + 1);
    });
  });

  describe('POST /payoutrequests/{id}/status', async () => {
    it('should correctly update a payout request status as admin', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.requestedBy.id !== ctx.adminUser.id
        && req.payoutRequestStatus.length === 1)[1];
      const before = await PayoutRequest.findOne(id, {
        relations: ['payoutRequestStatus'],
      });
      const res = await request(ctx.app)
        .post(`/payoutrequests/${id}/status`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ state: PayoutRequestState.APPROVED });
      expect(res.status).to.equal(200);

      const payoutRequest = res.body as PayoutRequestResponse;

      const validation = ctx.specification.validateModel('PayoutRequestResponse', payoutRequest, false, true);
      expect(validation.valid).to.be.true;
      expect(payoutRequest.status.length).to.equal(before.payoutRequestStatus.length + 1);
    });

    it("should return 403 if admin tries to cancel someone else's payout request", async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.requestedBy.id !== ctx.adminUser.id
        && req.payoutRequestStatus.length === 1)[1];
      const res = await request(ctx.app)
        .post(`/payoutrequests/${id}/status`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ state: PayoutRequestState.CANCELLED });
      expect(res.status).to.equal(403);
    });

    it('should return 403 if not admin', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.requestedBy.id !== ctx.localUser.id)[0];
      const res = await request(ctx.app)
        .post(`/payoutrequests/${id}/status`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ state: PayoutRequestState.APPROVED });
      expect(res.status).to.equal(403);
    });

    it('should correctly cancel payout request if cancelling own as user', async () => {
      const userRequests = ctx.payoutRequests
        .filter((req) => req.requestedBy.id === ctx.localUser.id
          && req.payoutRequestStatus.length === 1);
      const { id } = userRequests[0];
      const before = await PayoutRequest.findOne(id, {
        relations: ['payoutRequestStatus'],
      });
      const res = await request(ctx.app)
        .post(`/payoutrequests/${id}/status`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ state: PayoutRequestState.CANCELLED });
      expect(res.status).to.equal(200);

      const payoutRequest = res.body as PayoutRequestResponse;
      expect(payoutRequest.status.length).to.equal(before.payoutRequestStatus.length + 1);
    });

    it('should return 404 if payout request does not exist', async () => {
      const id = ctx.payoutRequests[ctx.payoutRequests.length - 1].id + 1000;
      const res = await request(ctx.app)
        .post(`/payoutrequests/${id}/status`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ state: PayoutRequestState.APPROVED });
      expect(res.status).to.equal(404);
    });

    it('should return 400 if sending invalid state', async () => {
      const { id } = ctx.payoutRequests[0];
      const res = await request(ctx.app)
        .post(`/payoutrequests/${id}/status`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ state: 'Yeeee' });
      expect(res.status).to.equal(400);
    });
  });
});
