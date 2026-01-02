/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import { json } from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import TokenHandler from '../../../src/authentication/token-handler';
import VoucherGroupController from '../../../src/controller/voucher-group-controller';
import { VoucherGroupRequest } from '../../../src/controller/request/voucher-group-request';
import VoucherGroupResponse from '../../../src/controller/response/voucher-group-response';
import Database from '../../../src/database/database';
import VoucherGroup from '../../../src/entity/user/voucher-group';
import User, {
  TermsOfServiceStatus,
  UserType,
} from '../../../src/entity/user/user';
import UserVoucherGroup from '../../../src/entity/user/user-voucher-group';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import VoucherGroupService from '../../../src/service/voucher-group-service';
import Swagger from '../../../src/start/swagger';
import {
  defaultPagination,
  PaginationResult,
} from '../../../src/helpers/pagination';
import { bkgEq } from '../service/voucher-group-service';
import Sinon from 'sinon';
import { DineroObjectRequest } from '../../../src/controller/request/dinero-request';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { RbacSeeder } from '../../seed';

async function saveBKG(
  bkgReq: VoucherGroupRequest,
): Promise<VoucherGroupResponse> {
  // save voucher group
  const params = VoucherGroupService.asVoucherGroupParams(bkgReq);
  const bkgParams = VoucherGroupService.asVoucherGroup(params);
  const bkg = await VoucherGroup.save(bkgParams);
  const users = await VoucherGroupService.createVoucherUsers(
    bkgParams.name,
    bkgParams.activeStartDate <= new Date(),
    bkgParams.amount,
  );

  // save new user relations
  const userLinks = users.map(
    (user) => ({ user, voucherGroup: bkg } as UserVoucherGroup),
  );
  await UserVoucherGroup.save(userLinks);

  return VoucherGroupService.asVoucherGroupResponse(bkgParams, users);
}

describe('VoucherGroupController', async (): Promise<void> => {
  let ctx: {
    connection: DataSource;
    clock: Sinon.SinonFakeTimers,
    app: Application;
    specification: SwaggerSpecification;
    controller: VoucherGroupController;
    adminUser: User;
    localUser: User;
    adminToken: String;
    token: String;
    validVoucherGroupReq: VoucherGroupRequest;
    invalidVoucherGroupReq: VoucherGroupRequest;
  };

  // initialize context
  beforeEach(async () => {
    const clock = Sinon.useFakeTimers({ now: new Date('2000-01-01T00:00:00Z') });
    // initialize test database
    const connection = await Database.initialize();
    await truncateAllTables(connection);

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

    // test voucher groups
    const validVoucherGroupReq: VoucherGroupRequest = {
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

    const invalidVoucherGroupReq: VoucherGroupRequest = {
      ...validVoucherGroupReq,
      name: '',
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        VoucherGroup: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);
    const roleManager = await new RoleManager().initialize();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256',
      publicKey: 'test',
      privateKey: 'test',
      expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken(
      await new RbacSeeder().getToken(adminUser, roles),
      'nonce admin',
    );
    const token = await tokenHandler.signToken(
      await new RbacSeeder().getToken(localUser, roles),
      'nonce',
    );

    const controller = new VoucherGroupController({
      specification,
      roleManager,
    });
    app.use(json());
    app.use(
      new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware(),
    );
    app.use('/vouchergroups', controller.getRouter());

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
      validVoucherGroupReq,
      invalidVoucherGroupReq,
    };
  });

  // close database connection
  afterEach(async () => {
    await finishTestDB(ctx.connection);
    ctx.clock.restore();
  });

  describe('GET /vouchergroups', () => {
    it('should return correct model', async () => {
      // save voucher group
      await saveBKG(ctx.validVoucherGroupReq);

      // get voucher groups
      const res = await request(ctx.app)
        .get('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(
        ctx.specification.validateModel(
          'PaginatedVoucherGroupResponse',
          res.body,
          false,
          true,
        ).valid,
      ).to.be.true;
    });
    it('should return an HTTP 200 and all voucher groups without users in the database if admin', async () => {
      // save voucher group
      await saveBKG(ctx.validVoucherGroupReq);

      // get voucher groups
      const res = await request(ctx.app)
        .get('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check if voucher groups are returned without users
      const voucherGroups = res.body.records as VoucherGroup[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      expect(
        voucherGroups.length,
        'size of response not equal to size of database',
      ).to.equal(await VoucherGroup.count());

      // success code
      expect(res.status, 'incorrect status on get').to.equal(200);

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(await VoucherGroup.count());
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save voucher group
      await saveBKG(ctx.validVoucherGroupReq);

      const res = await request(ctx.app)
        .get('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body, 'body not empty').to.be.empty;

      // forbidden code
      expect(res.status, 'incorrect status on forbidden get').to.equal(403);
    });
  });

  describe('POST /vouchergroups', () => {
    it('should return correct model', async () => {
      // post voucher group
      const res = await request(ctx.app)
        .post('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validVoucherGroupReq);
      expect(res.status).to.equal(200);

      const validation =
        ctx.specification.validateModel(
          'VoucherGroupResponse',
          res.body,
          false,
          true,
        );
      expect(validation.valid).to.be.true;
    });
    it('should store the given voucher group and its users in the database and return an HTTP 200 and the voucher group with users if admin', async () => {
      // post voucher group
      const res = await request(ctx.app)
        .post('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validVoucherGroupReq);

      // success code
      expect(res.status, 'status incorrect on valid post').to.equal(200);
      bkgEq(VoucherGroupService.asVoucherGroupParams(ctx.validVoucherGroupReq), res.body);
    });
    it('should return an HTTP 400 if the given voucher group is invalid', async () => {
      // post invalid voucher group
      const res = await request(ctx.app)
        .post('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidVoucherGroupReq);

      // invalid voucher group response response
      expect(res.body, 'voucher group not invalidated').to.equal(
        'Invalid voucher group.',
      );

      // invalid code
      expect(res.status, 'status incorrect on invalid post').to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // post voucher group
      const res = await request(ctx.app)
        .post('/vouchergroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validVoucherGroupReq);

      // forbidden code
      expect(res.status, 'status incorrect on forbidden post').to.equal(403);

      // check no response body
      expect(res.body, 'body not empty on forbidden post').to.be.empty;
    });
  });

  describe('GET /vouchergroups/:id', () => {
    it('should return correct model', async () => {
      // save voucher group
      await saveBKG(ctx.validVoucherGroupReq);
      // get voucher group by id
      const res = await request(ctx.app)
        .get('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation =
        ctx.specification.validateModel(
          'VoucherGroupResponse',
          res.body,
          false,
          true,
        );
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 200 and the voucher group and users with given id if admin', async () => {
      // save voucher group
      await saveBKG(ctx.validVoucherGroupReq);

      // get voucher group by id
      const res = await request(ctx.app)
        .get('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // success code
      expect(res.status).to.equal(200);

      const bkgRes = res.body as VoucherGroupResponse;

      expect(bkgRes, 'voucher group not found').to.not.be.empty;
      bkgEq(VoucherGroupService.asVoucherGroupParams(ctx.validVoucherGroupReq), bkgRes);
    });
    it('should return an HTTP 404 if the voucher group with given id does not exist', async () => {
      // get voucher group by id
      const res = await request(ctx.app)
        .get('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // not found code
      expect(res.status).to.equal(404);

      expect(
        res.body,
        'voucher group found while id not in database',
      ).to.equal('Voucher group not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save voucher group
      await saveBKG(ctx.validVoucherGroupReq);

      // get voucher group by id
      const res = await request(ctx.app)
        .get('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      // forbidden code
      expect(res.status).to.equal(403);

      const bkgRes = res.body as VoucherGroupResponse;

      expect(bkgRes, 'voucher group returned').to.be.empty;
    });
  });

  describe('PATCH /vouchergroups/:id', () => {
    it('should update and return an HTTP 200 and the voucher group and users if admin', async () => {
      await saveBKG(ctx.validVoucherGroupReq);

      // update voucher group by id
      const res = await request(ctx.app)
        .patch('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validVoucherGroupReq);

      // success code
      expect(res.status).to.equal(200);

      expect(
        ctx.specification.validateModel(
          'VoucherGroupResponse',
          res.body,
          false,
          true,
        ).valid,
      ).to.be.true;

      // check returned voucher group
      bkgEq(
        VoucherGroupService.asVoucherGroupParams(ctx.validVoucherGroupReq),
        res.body as VoucherGroupResponse,
      );
    });
    it('should return an HTTP 400 if given voucher group is invalid', async () => {
      await saveBKG(ctx.validVoucherGroupReq);

      // update voucher group by id
      const res = await request(ctx.app)
        .patch('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidVoucherGroupReq);

      // invalid code
      expect(res.status).to.equal(400);

      // check empty body
      expect(res.body, 'voucher group not invalidated').to.equal(
        'Invalid voucher group.',
      );
    });
    it('should return an HTTP 404 if the voucher group with given id does not exist', async () => {
      // patch voucher by id
      const res = await request(ctx.app)
        .patch('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validVoucherGroupReq);

      // not found code
      expect(res.status).to.equal(404);

      expect(
        res.body,
        'voucher group found while id not in database',
      ).to.equal('Voucher group not found.');

    });
    it('should return an HTTP 403 if not admin', async () => {
      await saveBKG(ctx.validVoucherGroupReq);

      // update voucher group by id
      const res = await request(ctx.app)
        .patch('/vouchergroups/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validVoucherGroupReq);

      // forbidden code
      expect(res.status).to.equal(403);

      // check empty body
      expect(res.body, 'returned a voucher group').to.be.empty;
    });
  });
});
