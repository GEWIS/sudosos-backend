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
import { SwaggerSpecification } from 'swagger-model-validator';
import InactiveAdministrativeCostController from '../../../src/controller/inactive-administrative-cost-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import {
  CreateInactiveAdministrativeCostRequest,
} from '../../../src/controller/request/inactive-administrative-cost-request';
import InactiveAdministrativeCost from '../../../src/entity/transactions/inactive-administrative-cost';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { RbacSeeder, TransferSeeder, UserSeeder } from '../../seed';
import InactiveAdministrativeCostSeeder from '../../seed/ledger/inactive-administrative-cost-seeder';
import RoleManager from '../../../src/rbac/role-manager';
import TokenHandler from '../../../src/authentication/token-handler';
import { json } from 'body-parser';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { finishTestDB } from '../../helpers/test-helpers';
import { expect, request } from 'chai';
import Swagger from '../../../src/start/swagger';
import {
  BaseInactiveAdministrativeCostResponse,
} from '../../../src/controller/response/inactive-administrative-cost-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { INVALID_USER_ID } from '../../../src/controller/request/validators/validation-errors';
import Transfer from '../../../src/entity/transactions/transfer';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import { rootStubs } from '../../root-hooks';
import Mailer from '../../../src/mailer';
import nodemailer, { Transporter } from 'nodemailer';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';


describe('InactiveAdministrativeCostController', async () => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: InactiveAdministrativeCostController,
    adminUser: User,
    localUser: User,
    adminToken: string,
    validInactiveAdministrativeCostRequest: CreateInactiveAdministrativeCostRequest,
    token: string,
    inactiveAdministrativeCosts: InactiveAdministrativeCost[],
    transfers: Transfer[],
    users: User[],
  };

  let sandbox: SinonSandbox;
  let sendMailFake: SinonSpy;

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const begin = new Date(new Date().getFullYear() - 1, 1);
    const end = new Date();

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
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    const users = await new UserSeeder().seed();

    const transfers = await new TransferSeeder().seed(users, new Date(2019, 1), new Date(2020, 1));

    const { inactiveAdministrativeCosts, inactiveAdministrativeCostsTransfers } = await new InactiveAdministrativeCostSeeder().seed([localUser, adminUser], begin, end);

    transfers.concat(inactiveAdministrativeCostsTransfers);

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        InactiveAdministrativeCost: {
          create: all,
          get: all,
          update: all,
          delete: all,
          notify: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        InactiveAdministrativeCost: {
          get: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    }]);

    const roleManager = await new RoleManager().initialize();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(adminUser, roles), 'nonce admin');
    const token = await tokenHandler.signToken(await new RbacSeeder().getToken(localUser, roles), 'nonce');

    const controller = new InactiveAdministrativeCostController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/inactiveAdministrativeCosts', controller.getRouter());

    await ServerSettingsStore.getInstance().initialize();

    const validInactiveAdministrativeCostRequest: CreateInactiveAdministrativeCostRequest = {
      forId: localUser.id,
    };

    ctx = {
      connection,
      app,
      validInactiveAdministrativeCostRequest,
      specification,
      controller,
      adminUser,
      localUser,
      token,
      adminToken,
      inactiveAdministrativeCosts,
      transfers,
      users,
    };
  });

  beforeEach(() => {
    // Restore the default stub
    rootStubs?.mail.restore();

    // Reset the mailer, because it was created with an old, expired stub
    Mailer.reset();

    sandbox = sinon.createSandbox();
    sendMailFake = sandbox.spy();
    sandbox.stub(nodemailer, 'createTransport').returns({
      sendMail: sendMailFake,
    } as any as Transporter);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('GET /inactive-administrative-costs', ()=> {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedInactiveAdministrativeCostResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing inactive administrative costs if admin', async () => {
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const inactiveAdministrativeCosts = res.body.records as BaseInactiveAdministrativeCostResponse[];
      const pagination = res.body._pagination as PaginationResult;

      const inactiveAdministrativeCostsCount = await InactiveAdministrativeCost.count();
      expect(inactiveAdministrativeCosts.length).to.equal(Math.min(inactiveAdministrativeCostsCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(inactiveAdministrativeCostsCount);
    });
    it('should return an HTTP 403 if not an admin', async () => {
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should return all inactive administrative costs for a user', async () => {
      const userId = ctx.users[0].id;

      const res = await request(ctx.app)
        .get('/inactive-administrative-costs')
        .query({ fromId: userId })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const inactiveAdministrativeCosts = res.body.records as BaseInactiveAdministrativeCostResponse[];
      for (const inactiveAdministrativeCost of inactiveAdministrativeCosts) {
        expect(inactiveAdministrativeCost.from.id).to.equal(userId);
      }
    });
    it('should return 400 error with wrong validation', async () => {
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs')
        .query({ test: "42 'Vo" })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(400);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const inactiveAdministrativeCosts = res.body.records as BaseInactiveAdministrativeCostResponse[];
      const pagination = res.body._pagination as PaginationResult;

      const inactiveAdministrativeCostsCount = await InactiveAdministrativeCost.count();
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(inactiveAdministrativeCostsCount);
      expect(inactiveAdministrativeCosts.length).to.be.at.most(take);
    });
  });
  describe('POST /inactive-administrative-costs', () => {
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validInactiveAdministrativeCostRequest);

      expect(res.status).to.equal(403);
    });
    it('should create an InactiveAdministrativeCost and return an HTTP 200 if admin.', async () => {
      const count = await InactiveAdministrativeCost.count();
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validInactiveAdministrativeCostRequest);

      expect(await InactiveAdministrativeCost.count()).to.equal(count + 1);
      expect(res.status).to.equal(200);
    });
    it('should verify that forId is a valid user', async () => {
      const req: CreateInactiveAdministrativeCostRequest = { forId: -1 };

      const res = await request(ctx.app)
        .post('/inactive-administrative-costs')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);

      expect(res.status).to.eq(400);
      expect(res.body).to.equal(INVALID_USER_ID().value);
    });
  });
  describe('GET /inactive-administrative-costs/{id}', () => {
    it('should return the correct model', async () => {
      const inactiveAdministrativeCost = (await InactiveAdministrativeCost.find())[0];
      const res = await request(ctx.app)
        .get(`/inactive-administrative-costs/${inactiveAdministrativeCost.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'InactiveAdministrativeCostResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the requested inactive administrative cost if exists and admin', async () => {
      const inactiveAdministrativeCost = (await InactiveAdministrativeCost.find())[0];
      const res = await request(ctx.app)
        .get(`/inactive-administrative-costs/${inactiveAdministrativeCost.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect((res.body as BaseInactiveAdministrativeCostResponse).id).to.be.equal(inactiveAdministrativeCost.id);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const inactiveAdministrativeCost = (await InactiveAdministrativeCost.find())[0];
      const res = await request(ctx.app)
        .get(`/inactive-administrative-costs/${inactiveAdministrativeCost.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.be.equal(403);
    });
    it('should return an HTTP 404 if inactive administrative cost does not exist', async () => {
      const count = await InactiveAdministrativeCost.count();
      const inactiveAdministrativeCost = (await InactiveAdministrativeCost.findOne({ where: { id: count + 1 } }));
      expect(inactiveAdministrativeCost).to.be.null;

      const res = await request(ctx.app)
        .get(`/inactive-administrative-costs/${count + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.be.equal(404);
    });
  });
  describe('DELETE /inactiveAdministrativeCost/{id}',  () => {
    it('should return an HTTP 204 and delete the requested invoice if exists and admin', async () => {
      const inactiveAdministrativeCost = (await InactiveAdministrativeCost.find())[0];

      const res = await request(ctx.app)
        .delete(`/inactive-administrative-costs/${inactiveAdministrativeCost.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;
    });
    it('should return an HTTP 403 if not admin', async () => {
      const inactiveAdministrativeCost = (await InactiveAdministrativeCost.find())[0];
      const res = await request(ctx.app)
        .delete(`/inactive-administrative-costs/${inactiveAdministrativeCost.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.be.equal(403);
    });
    it('should return an HTTP 404 if inactive administrative cost does not exist', async () => {
      const count = await InactiveAdministrativeCost.count();
      const inactiveAdministrativeCost = await InactiveAdministrativeCost.findOne({ where: { id: count + 2 } });
      expect(inactiveAdministrativeCost).to.be.null;

      const res = await request(ctx.app)
        .delete(`/inactive-administrative-costs/${count + 2}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.be.equal(404);
    });
  });
  describe('GET /inactive-administrative-costs/eligible-users',  () => {
    it('should return inactive users', async () => {
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs/eliigible-users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send('true');

      expect(res.status).to.be.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/inactive-administrative-costs/eligible-users')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.be.equal(403);
    });
  });
  describe('POST /inactive-administrative-costs/notify', () => {
    it('should notify users with given ID', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/notify')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ userIds: ctx.users.map((u) => u.id) });
      expect(res.status).to.equal(204);

      expect(sendMailFake.callCount).to.be.at.least(1);
    });
    it('should return 403 if user is not an admin', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/notify')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ userIds: ctx.users.map((u) => u.id) });
      expect(res.status).to.equal(403);
    });
    it('should return 400 if userIds is not an array', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/notify')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ userIds: '42Vo' });
      expect(res.status).to.equal(400);
    });
    it('should return 400 if array of userIds is invalid', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/notify')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ userIds: ['WieDitLeestTrektBak'] });
      expect(res.status).to.equal(400);
    });
  });
  describe('POST /inactive-administrative-costs/handout', () => {
    it('should handout inactive administrative costs to users with given ID', async () => {
      const count = await InactiveAdministrativeCost.count();
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/handout')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ userIds: ctx.users.map((u) => u.id) });
      expect(res.status).to.equal(200);

      expect(sendMailFake.callCount).to.be.at.least(1);
      expect(await InactiveAdministrativeCost.count()).to.be.equal(count + (ctx.users.map((u) => u.id)).length);
    });
    it('should return 403 if user is not an admin', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/handout')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ userIds: ctx.users.map((u) => u.id) });
      expect(res.status).to.equal(403);
    });
    it('should return 400 if userIds is not an array', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/handout')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ userIds: '42Vo' });
      expect(res.status).to.equal(400);
    });
    it('should return 400 if array of userIds is invalid', async () => {
      const res = await request(ctx.app)
        .post('/inactive-administrative-costs/handout')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ userIds: ['WieDitLeestTrektBak'] });
      expect(res.status).to.equal(400);
    });
  });
});