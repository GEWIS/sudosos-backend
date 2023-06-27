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
import { json } from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import TokenHandler from '../../../src/authentication/token-handler';
import BorrelkaartGroupController from '../../../src/controller/borrelkaart-group-controller';
import { BorrelkaartGroupRequest } from '../../../src/controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse from '../../../src/controller/response/borrelkaart-group-response';
import Database from '../../../src/database/database';
import BorrelkaartGroup from '../../../src/entity/user/borrelkaart-group';
import User, {
  TermsOfServiceStatus,
  UserType,
} from '../../../src/entity/user/user';
import UserBorrelkaartGroup from '../../../src/entity/user/user-borrelkaart-group';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import BorrelkaartGroupService from '../../../src/service/borrelkaart-group-service';
import Swagger from '../../../src/start/swagger';
import {
  defaultPagination,
  PaginationResult,
} from '../../../src/helpers/pagination';
import { bkgEq } from '../service/borrelkaart-group-service';
import Sinon from 'sinon';
import { DineroObjectRequest } from '../../../src/controller/request/dinero-request';

async function saveBKG(
  bkgReq: BorrelkaartGroupRequest,
): Promise<BorrelkaartGroupResponse> {
  // save borrelkaart group
  const params = BorrelkaartGroupService.asBorrelkaartGroupParams(bkgReq);
  const bkgParams = BorrelkaartGroupService.asBorrelkaartGroup(params);
  const bkg = await BorrelkaartGroup.save(bkgParams);
  const users = await BorrelkaartGroupService.createBorrelkaartUsers(
    bkgParams.name,
    bkgParams.activeStartDate <= new Date(),
    bkgParams.amount,
  );

  // save new user relations
  const userLinks = users.map(
    (user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup),
  );
  await UserBorrelkaartGroup.save(userLinks);

  return BorrelkaartGroupService.asBorrelkaartGroupResponse(bkgParams, users);
}

describe('BorrelkaartGroupController', async (): Promise<void> => {
  let ctx: {
    connection: Connection;
    clock: Sinon.SinonFakeTimers,
    app: Application;
    specification: SwaggerSpecification;
    controller: BorrelkaartGroupController;
    adminUser: User;
    localUser: User;
    adminToken: String;
    token: String;
    validBorrelkaartGroupReq: BorrelkaartGroupRequest;
    invalidBorrelkaartGroupReq: BorrelkaartGroupRequest;
  };

  // initialize context
  beforeEach(async () => {
    const clock = Sinon.useFakeTimers({ now: new Date('2000-01-01T00:00:00Z') });
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

    const localUser2 = {
      id: 3,
      firstName: 'User 2',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    await User.save(localUser2);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256',
      publicKey: 'test',
      privateKey: 'test',
      expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken(
      { user: adminUser, roles: ['Admin'], lesser: false },
      'nonce admin',
    );
    const token = await tokenHandler.signToken(
      { user: localUser, roles: [], lesser: false },
      'nonce',
    );

    // test borrelkaart groups
    const validBorrelkaartGroupReq: BorrelkaartGroupRequest = {
      name: 'test',
      activeStartDate: '2000-01-02T00:00:00Z',
      activeEndDate: '2000-01-03T00:00:00Z',
      balance: {
        amount: 100,
        currency: 'EUR',
        precision: 2,
      } as DineroObjectRequest,
      amount: 4,
    };

    const invalidBorrelkaartGroupReq: BorrelkaartGroupRequest = {
      ...validBorrelkaartGroupReq,
      name: '',
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        BorrelkaartGroup: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new BorrelkaartGroupController({
      specification,
      roleManager,
    });
    app.use(json());
    app.use(
      new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware(),
    );
    app.use('/borrelkaartgroups', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      clock,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      validBorrelkaartGroupReq,
      invalidBorrelkaartGroupReq,
    };
  });

  // close database connection
  afterEach(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.destroy();
    ctx.clock.restore();
  });

  describe('GET /borrelkaartgroups', () => {
    it('should return correct model', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart groups
      const res = await request(ctx.app)
        .get('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(
        ctx.specification.validateModel(
          'PaginatedBorrelkaartGroupResponse',
          res.body,
          false,
          true,
        ).valid,
      ).to.be.true;
    });
    it('should return an HTTP 200 and all borrelkaart groups without users in the database if admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart groups
      const res = await request(ctx.app)
        .get('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check if borrelkaart groups are returned without users
      const borrelkaartGroups = res.body.records as BorrelkaartGroup[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      expect(
        borrelkaartGroups.length,
        'size of response not equal to size of database',
      ).to.equal(await BorrelkaartGroup.count());

      // success code
      expect(res.status, 'incorrect status on get').to.equal(200);

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(await BorrelkaartGroup.count());
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      const res = await request(ctx.app)
        .get('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body, 'body not empty').to.be.empty;

      // forbidden code
      expect(res.status, 'incorrect status on forbidden get').to.equal(403);
    });
  });

  describe('POST /borrelkaartgroups', () => {
    it('should return correct model', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);
      expect(res.status).to.equal(200);

      const validation =
        ctx.specification.validateModel(
          'BorrelkaartGroupResponse',
          res.body,
          false,
          true,
        );
      expect(validation.valid).to.be.true;
    });
    it('should store the given borrelkaart group and its users in the database and return an HTTP 200 and the borrelkaart group with users if admin', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);

      // success code
      expect(res.status, 'status incorrect on valid post').to.equal(200);
      bkgEq(BorrelkaartGroupService.asBorrelkaartGroupParams(ctx.validBorrelkaartGroupReq), res.body);
    });
    it('should return an HTTP 400 if the given borrelkaart group is invalid', async () => {
      // post invalid borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBorrelkaartGroupReq);

      // invalid borrelkaart group response response
      expect(res.body, 'borrelkaart group not invalidated').to.equal(
        'Invalid borrelkaart group.',
      );

      // invalid code
      expect(res.status, 'status incorrect on invalid post').to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBorrelkaartGroupReq);

      // forbidden code
      expect(res.status, 'status incorrect on forbidden post').to.equal(403);

      // check no response body
      expect(res.body, 'body not empty on forbidden post').to.be.empty;
    });
  });

  describe('GET /borrelkaartgroups/:id', () => {
    it('should return correct model', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);
      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation =
        ctx.specification.validateModel(
          'BorrelkaartGroupResponse',
          res.body,
          false,
          true,
        );
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 200 and the borrelkaart group and users with given id if admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // success code
      expect(res.status).to.equal(200);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group not found').to.not.be.empty;
      bkgEq(BorrelkaartGroupService.asBorrelkaartGroupParams(ctx.validBorrelkaartGroupReq), bkgRes);
    });
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist', async () => {
      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // not found code
      expect(res.status).to.equal(404);

      expect(
        res.body,
        'borrelkaart group found while id not in database',
      ).to.equal('Borrelkaart group not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      // forbidden code
      expect(res.status).to.equal(403);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group returned').to.be.empty;
    });
  });

  describe('PATCH /borrelkaartgroups/:id', () => {
    it('should update and return an HTTP 200 and the borrelkaart group and users if admin', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // update borrelkaart group by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);

      // success code
      expect(res.status).to.equal(200);

      expect(
        ctx.specification.validateModel(
          'BorrelkaartGroupResponse',
          res.body,
          false,
          true,
        ).valid,
      ).to.be.true;

      // check returned borrelkaart group
      bkgEq(
        BorrelkaartGroupService.asBorrelkaartGroupParams(ctx.validBorrelkaartGroupReq),
        res.body as BorrelkaartGroupResponse,
      );
    });
    it('should return an HTTP 400 if given borrelkaart group is invalid', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // update borrelkaart group by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBorrelkaartGroupReq);

      // invalid code
      expect(res.status).to.equal(400);

      // check empty body
      expect(res.body, 'borrelkaart group not invalidated').to.equal(
        'Invalid borrelkaart group.',
      );
    });
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist', async () => {
      // patch borrelkaart by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);

      // not found code
      expect(res.status).to.equal(404);

      expect(
        res.body,
        'borrelkaart group found while id not in database',
      ).to.equal('Borrelkaart group not found.');

    });
    it('should return an HTTP 403 if not admin', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // update borrelkaart group by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBorrelkaartGroupReq);

      // forbidden code
      expect(res.status).to.equal(403);

      // check empty body
      expect(res.body, 'returned a borrelkaart group').to.be.empty;
    });
  });
});
