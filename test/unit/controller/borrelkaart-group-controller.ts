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
import BorrelkaartGroupRequest from '../../../src/controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse from '../../../src/controller/response/borrelkaart-group-response';
import Database from '../../../src/database/database';
import BorrelkaartGroup from '../../../src/entity/user/borrelkaart-group';
import User, { UserType } from '../../../src/entity/user/user';
import UserBorrelkaartGroup from '../../../src/entity/user/user-borrelkaart-group';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import BorrelkaartGroupService from '../../../src/service/borrelkaart-group-service';
import Swagger from '../../../src/start/swagger';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';

function bkgEq(req: BorrelkaartGroupRequest, res: BorrelkaartGroupResponse): Boolean {
  // check if non user fields are equal
  if (!(req.name === res.name
    && Date.parse(req.activeStartDate) === Date.parse(res.activeStartDate)
    && Date.parse(req.activeEndDate) === Date.parse(res.activeEndDate))) {
    return false;
  }

  let usersOk = true;
  const reqIds = req.users.map((user) => user.id);
  const resIds = res.users.map((user) => user.id);

  // check if requested users in response users
  reqIds.forEach((id) => {
    if (!resIds.includes(id)) {
      usersOk = false;
    }
  });

  if (!usersOk) {
    return false;
  }

  // check if response users in requested users
  resIds.forEach((id) => {
    if (!reqIds.includes(id)) {
      usersOk = false;
    }
  });

  return usersOk;
}

async function saveBKG(bkgReq: BorrelkaartGroupRequest): Promise<BorrelkaartGroupResponse> {
  // save borrelkaart group
  const bkg = BorrelkaartGroupService.asBorrelkaartGroup(bkgReq);
  await BorrelkaartGroup.save(bkg);

  // save user links to borrelkaart group
  const userLinks: UserBorrelkaartGroup[] = bkgReq.users
    .map((user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup));
  await UserBorrelkaartGroup.save(userLinks);

  return BorrelkaartGroupService.asBorrelkaartGroupResponse(bkg, bkgReq.users);
}

describe('BorrelkaartGroupController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BorrelkaartGroupController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    validBorrelkaartGroupReq: BorrelkaartGroupRequest,
    conflictingBorrelkaartGroupReq: BorrelkaartGroupRequest,
    invalidBorrelkaartGroupReq: BorrelkaartGroupRequest,
  };

  // initialize context
  beforeEach(async () => {
    // initialize test database
    const connection = await Database.initialize();

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
    } as User;

    const localUser2 = {
      id: 3,
      firstName: 'User 2',
      type: UserType.LOCAL_USER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    await User.save(localUser2);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: [] }, 'nonce');

    // test borrelkaart groups
    const validBorrelkaartGroupReq = {
      name: 'coole groep',
      activeStartDate: '2100-01-01T17:00:00Z',
      activeEndDate: '2100-01-01T21:00:00Z',
      users: [
        adminUser,
        localUser,
      ],
    } as BorrelkaartGroupRequest;

    const conflictingBorrelkaartGroupReq = {
      name: 'conflicting group',
      activeStartDate: '2100-02-01T17:00:00Z',
      activeEndDate: '2100-02-01T21:00:00Z',
      users: [
        adminUser,
        localUser2,
      ],
    } as BorrelkaartGroupRequest;

    const invalidBorrelkaartGroupReq = {
      ...validBorrelkaartGroupReq,
      name: '',
      users: [
        localUser2,
      ],
    } as BorrelkaartGroupRequest;

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

    const controller = new BorrelkaartGroupController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/borrelkaartgroups', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      validBorrelkaartGroupReq,
      conflictingBorrelkaartGroupReq,
      invalidBorrelkaartGroupReq,
    };
  });

  // close database connection
  afterEach(async () => {
    await UserBorrelkaartGroup.clear();
    await User.clear();
    await BorrelkaartGroup.clear();
    await ctx.connection.close();
  });

  describe('verify borrelkaart group', () => {
    it('should return true when the borrelkaart is valid', async () => {
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.validBorrelkaartGroupReq), 'valid borrelkaart group incorrectly asserted as false').to.be.true;
    });
    it('should return false when the borrelkaart is invalid', async () => {
      // empty name
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'empty name').to.be.false;

      // invalid date
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReq,
        activeStartDate: 'geen date format',
      } as BorrelkaartGroupRequest;
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'invalid date').to.be.false;

      // end date in past
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReq,
        activeEndDate: '2000-01-01T21:00:00Z',
      } as BorrelkaartGroupRequest;
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'end date in past').to.be.false;

      // end date <= start date
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReq,
        activeStartDate: '2000-01-01T21:00:00Z',
        activeEndDate: '2000-01-01T21:00:00Z',
      } as BorrelkaartGroupRequest;
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'end date <= start date').to.be.false;

      // no users given
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReq,
        users: [],
      } as BorrelkaartGroupRequest;
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'no users given').to.be.false;

      // distinct user id's
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReq,
        users: [
          ctx.adminUser,
          ctx.localUser,
          {
            id: 3,
            firstName: 'fail user',
            type: UserType.LOCAL_USER,
            active: true,
          },
          {
            id: 3,
            firstName: 'fail user 2',
            type: UserType.LOCAL_USER,
            active: true,
          },
        ],
      } as BorrelkaartGroupRequest;
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'user ids not distinct').to.be.false;

      // a user not in database
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReq,
        users: [
          ctx.adminUser,
          ctx.localUser,
          {
            id: 4,
            firstName: 'fail user',
            type: UserType.LOCAL_USER,
            active: true,
          },
        ],
      } as BorrelkaartGroupRequest;
      expect(await BorrelkaartGroupService.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'user not in database').to.be.false;
    });
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
      expect(ctx.specification.validateModel(
        'PaginatedBorrelkaartGroupResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
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
      expect(borrelkaartGroups.length, 'size of response not equal to size of database').to.equal(await BorrelkaartGroup.count());

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
      console.error(ctx.specification.validateModel(
        'BorrelkaartGroupResponse',
        res.body,
        false,
        true,
      ));
      expect(ctx.specification.validateModel(
        'BorrelkaartGroupResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should store the given borrelkaart group and its users in the database and return an HTTP 200 and the borrelkaart group with users if admin', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);

      // check if response correct
      const bkgRes = res.body as BorrelkaartGroupResponse;

      // check if borrelkaart group in database
      const borrelkaartGroup = await BorrelkaartGroup.findOne(bkgRes.id);
      expect(borrelkaartGroup, 'did not find borrelkaart group').to.not.be.undefined;

      // check if user in database
      const bkgRelation = await UserBorrelkaartGroup.findOne(bkgRes.users[0].id, { relations: ['borrelkaartGroup'] });
      expect(bkgRelation.borrelkaartGroup.id, 'user not linked to borrelkaart group').to.equal(bkgRes.id);

      // success code
      expect(res.status, 'status incorrect on valid post').to.equal(200);
    });
    it('should return an HTTP 400 if the given borrelkaart group is invalid', async () => {
      // post invalid borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBorrelkaartGroupReq);

      // invalid borrelkaart group response response
      expect(res.body, 'borrelkaart group not invalidated').to.equal('Invalid borrelkaart group.');

      // check if banner not in database
      const borrelkaartGroup = await BorrelkaartGroup
        .findOne({ name: ctx.invalidBorrelkaartGroupReq.name });
      expect(borrelkaartGroup, 'borrelkaart group in databse on invalid post').to.be.undefined;

      // invalid code
      expect(res.status, 'status incorrect on invalid post').to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBorrelkaartGroupReq);

      // check no response body
      expect(res.body, 'body not empty on forbidden post').to.be.empty;

      // forbidden code
      expect(res.status, 'status incorrect on forbidden post').to.equal(403);
    });
    it('should return an HTTP 409 if a user in the request is already assigned to a borrelkaart group', async () => {
      // post borrelkaart group
      await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);

      // post conflicting borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.conflictingBorrelkaartGroupReq);

      // check if request denied and borrelkaart group not posted
      expect(await BorrelkaartGroup.findOne({ name: ctx.conflictingBorrelkaartGroupReq.name }), 'conflicting group was saved').to.be.undefined;

      // check correct message
      expect(res.body, 'incorrect return body').to.equal('Conflicting user posted.');

      // conflict code
      expect(res.status, 'status incorrect on conflicting post').to.equal(409);
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
      expect(ctx.specification.validateModel(
        'BorrelkaartGroupResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the borrelkaart group and users with given id if admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group not found').to.not.be.empty;
      expect(bkgEq(ctx.validBorrelkaartGroupReq, bkgRes), 'returned borrelkaart group not correct').to.be.true;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist', async () => {
      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.body, 'borrelkaart group found while id not in database').to.equal('Borrelkaart group not found.');

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group returned').to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('PATCH /borrelkaartgroups/:id', () => {
    it('should update and return an HTTP 200 and the borrelkaart group and users with given id if admin', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // update borrelkaart group by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.conflictingBorrelkaartGroupReq);

      expect(ctx.specification.validateModel(
        'BorrelkaartGroupResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      // check returned borrelkaart group
      expect(bkgEq(ctx.conflictingBorrelkaartGroupReq, res.body as BorrelkaartGroupResponse), 'returned borrelkaart group incorrect').to.be.true;

      // check database
      const bkgUpdated = await BorrelkaartGroup.findOne(1);
      const users = await User.findByIds((await UserBorrelkaartGroup.find({
        relations: ['user'],
        where: { borrelkaartGroup: 1 },
      })).map((ubkg) => ubkg.user.id));

      expect(bkgUpdated.name, 'updated borrelkaart group not found in database').to.equal(ctx.conflictingBorrelkaartGroupReq.name);
      expect(users.map((user) => user.id), 'users not updated correctly').to.eql(ctx.conflictingBorrelkaartGroupReq.users.map((user) => user.id));

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if given borrelkaart group is invalid', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // update borrelkaart group by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBorrelkaartGroupReq);

      // check empty body
      expect(res.body, 'borrelkaart group not invalidated').to.equal('Invalid borrelkaart group.');

      // check database
      const bkgDb = await BorrelkaartGroup.findOne(1);
      const users = await User.findByIds((await UserBorrelkaartGroup.find({
        relations: ['user'],
        where: { borrelkaartGroup: 1 },
      })).map((ubkg) => ubkg.user.id));

      expect(bkgDb.name, 'borrelkaart group updated in database').to.equal(ctx.validBorrelkaartGroupReq.name);
      expect(users.map((user) => user.id), 'users updated in database').to.eql(ctx.validBorrelkaartGroupReq.users.map((user) => user.id));

      // invalid code
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist', async () => {
      // patch borrelkaart by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReq);

      expect(res.body, 'borrelkaart group found while id not in database').to.equal('Borrelkaart group not found.');

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // update borrelkaart group by id
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.conflictingBorrelkaartGroupReq);

      // check empty body
      expect(res.body, 'returned a borrelkaart group').to.be.empty;

      // check database
      const bkgDb = await BorrelkaartGroup.findOne(1);
      const users = await User.findByIds((await UserBorrelkaartGroup.find({
        relations: ['user'],
        where: { borrelkaartGroup: 1 },
      })).map((ubkg) => ubkg.user.id));

      expect(bkgDb.name, 'borrelkaart group updated in database').to.equal(ctx.validBorrelkaartGroupReq.name);
      expect(users.map((user) => user.id), 'users updated in database').to.eql(ctx.validBorrelkaartGroupReq.users.map((user) => user.id));

      // forbidden code
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 409 if a user in the request is already assigned to a borrelkaart group', async () => {
      await saveBKG(ctx.validBorrelkaartGroupReq);
      await saveBKG(ctx.invalidBorrelkaartGroupReq);

      // patch conflicting borrelkaart group
      const res = await request(ctx.app)
        .patch('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.conflictingBorrelkaartGroupReq);

      // check if request denied and borrelkaart group not patched
      expect(await BorrelkaartGroup.findOne({ name: ctx.conflictingBorrelkaartGroupReq.name }), 'conflicting group was saved').to.be.undefined;

      // conflict code
      expect(res.status, 'status incorrect on conflicting post').to.equal(409);
    });
  });

  describe('DELETE /borrelkaartgroups/:id', () => {
    it('should delete the borrelkaart group and user links from the database and return an HTTP 200 and the borrelkaart group with given id if admin', async () => {
      // save valid borrelkaart group with id 1
      const bkgDel = await saveBKG(ctx.validBorrelkaartGroupReq);

      // delete the borrelkaart group
      const res = await request(ctx.app)
        .delete('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(ctx.specification.validateModel(
        'BorrelkaartGroupResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      // test deletion
      expect(res.body as BorrelkaartGroupResponse, 'returned borrelkaart group incorrect').to.eql(bkgDel);
      expect(await BorrelkaartGroup.findOne(1), 'borrelkaart group not deleted').to.be.undefined;

      // test relation deletion
      expect((await UserBorrelkaartGroup.find({
        relations: ['borrelkaartGroup'],
        where: {
          borrelkaartGroup: bkgDel.id,
        },
      })).length, 'borrelkaart group relations not deleted').to.equal(0);

      expect((await UserBorrelkaartGroup.findByIds(bkgDel.users.map((user) => user.id), {
        relations: ['user'],
      })).length, 'user relations not deleted').to.equal(0);

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist', async () => {
      // delete non existent borrelkaart group
      const res = await request(ctx.app)
        .delete('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check response body
      expect(res.body, 'something returned').to.equal('Borrelkaart group not found.');

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save borrelkaart group
      await saveBKG(ctx.validBorrelkaartGroupReq);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .delete('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group returned').to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });
});
