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
import { RbacSeeder } from '../../seed';
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
  };

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

    const { inactiveAdministrativeCosts } = await new InactiveAdministrativeCostSeeder().seed([localUser, adminUser], begin, end);

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
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /inactiveAdministrativeCosts', ()=> {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/inactiveAdministrativeCosts')
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
        .get('/inactiveAdministrativeCosts')
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
        .get('/inactiveAdministrativeCosts')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/inactiveAdministrativeCosts')
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
  describe('POST /inactiveAdministrativeCost', () => {
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/inactiveAdministrativeCosts')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
    });
    it('should create an InactiveAdministrativeCost and return an HTTP 200 if admin.', async () => {
      const count = await InactiveAdministrativeCost.count();
      const res = await request(ctx.app)
        .post('/inactiveAdministrativeCosts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validInactiveAdministrativeCostRequest);

      expect(await InactiveAdministrativeCost.count()).to.equal(count + 1);
      expect(res.status).to.equal(200);
    });
  });
});