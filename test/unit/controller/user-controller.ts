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
import express, { Application } from 'express';
import chai, { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection, createQueryBuilder } from 'typeorm';
import { json } from 'body-parser';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { describe } from 'mocha';
import UserController from '../../../src/controller/user-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Product from '../../../src/entity/product/product';
import Transaction from '../../../src/entity/transactions/transaction';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import TokenMiddleware, { RequestWithToken } from '../../../src/middleware/token-middleware';
import ProductCategory from '../../../src/entity/product/product-category';
import Container from '../../../src/entity/container/container';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import seedDatabase from '../../seed';
import { verifyUserResponse } from '../validators';
import RoleManager from '../../../src/rbac/role-manager';
import { TransactionResponse } from '../../../src/controller/response/transaction-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import Transfer from '../../../src/entity/transactions/transfer';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import UpdatePinRequest from '../../../src/controller/request/update-pin-request';
import { INVALID_PIN } from '../../../src/controller/request/validators/validation-errors';
import { PaginatedUserResponse, UserResponse } from '../../../src/controller/response/user-response';
import RoleResponse from '../../../src/controller/response/rbac/role-response';
import {
  FinancialMutationResponse,
} from '../../../src/controller/response/financial-mutation-response';
import UpdateLocalRequest from '../../../src/controller/request/update-local-request';
import { AcceptTosRequest } from '../../../src/controller/request/accept-tos-request';
import UpdateUserRequest from '../../../src/controller/request/update-user-request';
import StripeDeposit from '../../../src/entity/deposit/stripe-deposit';
import { StripeDepositResponse } from '../../../src/controller/response/stripe-response';
import { TransactionReportResponse } from '../../../src/controller/response/transaction-report-response';
import TransactionService from '../../../src/service/transaction-service';

chai.use(deepEqualInAnyOrder);

describe('UserController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserController,
    userToken: string,
    adminToken: string,
    organMemberToken: string,
    deletedUser: User,
    user: User,
    organ: User,
    tokenHandler: TokenHandler,
    users: User[],
    categories: ProductCategory[],
    products: Product[],
    productRevisions: ProductRevision[],
    containers: Container[],
    containerRevisions: ContainerRevision[],
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    transfers: Transfer[],
    stripeDeposits: StripeDeposit[],
  };

  before(async () => {
    const connection = await Database.initialize();
    ctx = { connection } as any; // on timeout forces connection to close
    const app = express();
    const database = await seedDatabase();
    ctx = {
      tokenHandler: undefined,
      connection,
      app,
      specification: undefined,
      controller: undefined,
      userToken: undefined,
      adminToken: undefined,
      organMemberToken: undefined,
      deletedUser: undefined,
      organ: undefined,
      user: {
        firstName: 'Roy',
        lastName: 'Kakkenberg',
        type: UserType.MEMBER,
        email: 'spam@gewis.nl',
      } as any as User,
      ...database,
    };
    const deletedUser = Object.assign(new User(), {
      firstName: 'Kevin',
      lastName: 'Jilessen',
      type: UserType.MEMBER,
      deleted: true,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);
    await User.save(deletedUser);

    ctx.organ = Object.assign(new User(), {
      firstName: 'ORGAN',
      type: UserType.ORGAN,
      deleted: false,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    } as User);
    await User.save(ctx.organ);

    ctx.users.push(deletedUser);
    ctx.users.push(ctx.organ);
    ctx.deletedUser = deletedUser;

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.tokenHandler = tokenHandler;
    ctx.userToken = await tokenHandler.signToken({ user: ctx.users[0], roles: ['User'], lesser: false }, '1');
    ctx.adminToken = await tokenHandler.signToken({ user: ctx.users[6], roles: ['User', 'Admin'], lesser: false }, '1');
    ctx.organMemberToken = await tokenHandler.signToken({
      user: ctx.users[6], roles: ['User', 'Seller'], organs: [ctx.organ], lesser: false,
    }, '1');

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const organ = { organ: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        User: {
          create: all,
          get: all,
          update: all,
          delete: all,
          acceptToS: all,
        },
        Product: {
          get: all,
        },
        Container: {
          get: all,
        },
        PointOfSale: {
          get: all,
        },
        Transaction: {
          get: all,
        },
        Transfer: {
          get: all,
        },
        Authenticator: {
          get: all,
          update: all,
        },
        Roles: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });
    roleManager.registerRole({
      name: 'User',
      permissions: {
        User: {
          get: own,
          acceptToS: own,
          update: { own: new Set<string>(['firstName', 'lastName']) },
        },
        Product: {
          get: own,
          update: own,
        },
        Authenticator: {
          update: { own: new Set<string>(['pin', 'password']) },
          get: own,
        },
        Roles: {
          get: own,
        },
        Container: {
          get: own,
        },
        PointOfSale: {
          get: own,
        },
        Transaction: {
          get: own,
        },
        Transfer: {
          get: own,
        },
      },
      assignmentCheck: async () => true,
    });
    roleManager.registerRole({
      name: 'Seller',
      permissions: {
        User: {
          get: organ,
        },
      },
      assignmentCheck: async () => false,
    });

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new UserController({
      specification: ctx.specification,
      roleManager,
    }, tokenHandler);

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/users', ctx.controller.getRouter());
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('GET /users', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedUserResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return all users if admin', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const activeUsers = ctx.users.filter((u) => !u.deleted);

      const users = (res.body as PaginatedUserResponse).records;
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      const spec = await Swagger.importSpecification();
      expect(users.length).to.equal(Math.min(activeUsers.length, pagination.take));
      users.forEach((user: UserResponse) => {
        verifyUserResponse(spec, user);
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activeUsers.length);
    });
    it('should give an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/users')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const activeUsers = ctx.users.filter((u) => !u.deleted);

      const users = res.body.records as User[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(activeUsers.length);
      expect(users.length).to.be.at.most(take);
    });
  });

  describe('GET /users/usertype/:userType', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get(`/users/usertype/${UserType[UserType.MEMBER]}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedUserResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return all users of type MEMBER if admin', async () => {
      const res = await request(ctx.app)
        .get(`/users/usertype/${UserType[UserType.MEMBER]}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const activeUsers = ctx.users.filter((u) => !u.deleted && u.type === UserType.MEMBER);

      const users = res.body.records as UserResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      const spec = await Swagger.importSpecification();
      expect(users.length).to.equal(Math.min(activeUsers.length, pagination.take));
      users.forEach((user: UserResponse) => {
        verifyUserResponse(spec, user);
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activeUsers.length);
    });
    it('should return all users of type INVOICE if admin', async () => {
      const res = await request(ctx.app)
        .get('/users/usertype/invoice')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const activeUsers = ctx.users.filter((u) => !u.deleted && u.type === UserType.INVOICE);

      const users = res.body.records as UserResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      const spec = await Swagger.importSpecification();
      expect(users.length).to.equal(Math.min(activeUsers.length, pagination.take));
      users.forEach((user: UserResponse) => {
        verifyUserResponse(spec, user);
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activeUsers.length);
    });
    it('should give an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get(`/users/usertype/${UserType.MEMBER}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/users/usertype/member')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const activeUsers = ctx.users.filter((u) => !u.deleted && u.type === UserType.MEMBER);

      const users = res.body.records as User[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(activeUsers.length);
      expect(users.length).to.be.at.most(take);
    });
    it('should give an HTTP 404 when admin requests usertype that does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/usertype/1000')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/:id', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'User',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return correct user (myself)', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });
    it('should give an HTTP 403 when requesting different user', async () => {
      const res = await request(ctx.app)
        .get('/users/2')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when requesting different user that does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/1234')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should return correct user when admin requests different user', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });
    it('should return correct user when user connected via organ', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.organ.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'User',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give an HTTP 404 when admin requests different user that does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/1234')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should give an HTTP 404 when admin requests deleted user', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.deletedUser.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/{id}/members', () => {
    it('should return correct model', async () => {
      const user = await User.findOne({ where: { type: UserType.ORGAN } });
      expect(user).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/members`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedUserResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all the members of the organ', async () => {
      await inUserContext((await UserFactory()).clone(3), async (...users: User[]) => {
        const organ = await User.findOne({ where: { type: UserType.ORGAN } });
        const promises: Promise<MemberAuthenticator>[] = [];
        users.forEach((user) => {
          const auth = Object.assign(new MemberAuthenticator(), {
            user,
            authenticateAs: organ,
          });
          promises.push(auth.save());
        });
        await Promise.all(promises);

        const res = await request(ctx.app)
          .get(`/users/${organ.id}/members`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);
        expect(res.status).to.equal(200);
        const userIds = users.map((user) => user.id);
        expect((res.body as PaginatedUserResponse).records.map(
          (user) => user.id,
        )).to.deep.equalInAnyOrder(userIds);
      });
    });
    it('should give an HTTP 403 when not admin', async () => {
      const user = await User.findOne({ where: { type: UserType.ORGAN } });
      expect(user).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/members`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 400 if requested user is not of type ORGAN', async () => {
      const user = await User.findOne({ where: { type: UserType.MEMBER } });
      expect(user).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/members`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });
    it('should give an http 404 if provided type does not exist', async () => {
      const userId = await User.count() + 1;
      const user = await User.findOne({ where: { id: userId } });
      expect(user).to.be.null;

      const res = await request(ctx.app)
        .get(`/users/${userId}/members`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /users', () => {
    it('should give an HTTP 403 when not an admin', async () => {
      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.user);
      expect(res.status).to.equal(403);
    });

    it('should give HTTP 200 when correctly creating user', async () => {
      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.user);
      expect(res.status).to.equal(201);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });

    it('should create user without lastName', async () => {
      const userObj = { ...ctx.user };
      delete userObj.lastName;

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(201);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });

    it('should create user with empty lastName', async () => {
      const userObj = { ...ctx.user, lastName: '' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(201);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });

    it('should give HTTP 400 when too long lastName', async () => {
      const userObj = { ...ctx.user, lastName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when no firstName', async () => {
      const userObj = { ...ctx.user };
      delete userObj.firstName;

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when empty firstName', async () => {
      const userObj = { ...ctx.user, firstName: '' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when too long firstName', async () => {
      const userObj = { ...ctx.user, firstName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when non-existing UserType', async () => {
      const userObj = { ...ctx.user, type: 6969420 };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when new user is already deleted', async () => {
      const userObj = { ...ctx.user, deleted: true };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should create user when active is true', async () => {
      const userObj = { ...ctx.user, active: true };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(201);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });

    it('should create user when active is false', async () => {
      const userObj = { ...ctx.user, active: false };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(201);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      verifyUserResponse(spec, user);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should give HTTP 403 when user is not an admin', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ ofAge: true });
      expect(res.status).to.equal(403);
    });
    it('should correctly change firstName if requester is admin', async () => {
      const firstName = 'Ralf';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ firstName });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.firstName).to.deep.equal(firstName);
      verifyUserResponse(spec, user);
    });
    it('should give HTTP 400 if firstName is emtpy', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ firstName: '' });
      expect(res.status).to.equal(400);
    });
    it('should give HTTP 400 if firstName is too long', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ firstName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' });
      expect(res.status).to.equal(400);
    });
    it('should correctly change lastName if requester is admin', async () => {
      const lastName = 'Eemers';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.lastName).to.deep.equal(lastName);
      verifyUserResponse(spec, user);
    });
    it('should correctly change lastName to empty string if requester is admin', async () => {
      const lastName = '';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.lastName).to.deep.equal(lastName);
      verifyUserResponse(spec, user);
    });
    it('should give HTTP 400 if firstName is too long', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' });
      expect(res.status).to.equal(400);
    });
    it('should correctly set user inactive if requester is admin', async () => {
      const active = false;

      const res = await request(ctx.app)
        .patch('/users/13')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ active });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.active).to.deep.equal(active);
      verifyUserResponse(spec, user);
    });
    it('should correctly set user active if requester is admin', async () => {
      const active = true;

      const res = await request(ctx.app)
        .patch('/users/12')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ active });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.active).to.deep.equal(active);
      verifyUserResponse(spec, user);
    });
    it('should give HTTP 400 if active is undefined', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ active: undefined });
      expect(res.status).to.equal(400);
    });
    it('should allow user to update own firstName', async () => {
      const firstName = 'Ralf';

      const res = await request(ctx.app)
        .patch(`/users/${ctx.users[0].id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ firstName });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.firstName).to.deep.equal(firstName);
      verifyUserResponse(spec, user);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should give HTTP 403 when user is not an admin', async () => {
      const res = await request(ctx.app)
        .delete('/users/24')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should correctly delete user if requester is admin', async () => {
      let res = await request(ctx.app)
        .delete('/users/24')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);

      // User does not exist anymore
      res = await request(ctx.app)
        .get('/users/24')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });

    it('should give HTTP 404 if admin and user does not exist', async () => {
      const res = await request(ctx.app)
        .delete('/users/1234')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });

    it('should give HTTP 400 if admin requests to delete itself', async () => {
      const res = await request(ctx.app)
        .delete('/users/7')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 404 if trying to delete user twice', async () => {
      const res = await request(ctx.app)
        .delete('/users/4')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);

      const res2 = await request(ctx.app)
        .delete('/users/4')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res2.status).to.equal(404);
    });
  });

  describe('GET /users/:id/products', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/users/1/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give correct owned products for user', async () => {
      const res = await request(ctx.app)
        .get('/users/1/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      // TODO: test response validity
    });
    it('should give an HTTP 403 when user requests products (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/2/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests products from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give correct owned products for admin', async () => {
      const res = await request(ctx.app)
        .get('/users/2/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      // TODO: test response validity
    });
    it('should give an HTTP 404 when admin requests products from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/:id/containers', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/users/1/containers')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedContainerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give an HTTP 200 when requesting own containers', async () => {
      const res = await request(ctx.app)
        .get('/users/1/containers')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when user requests containers (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/2/containers')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests containers from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/containers')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give correct owned containers for admin', async () => {
      const res = await request(ctx.app)
        .get('/users/2/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 404 when admin requests containers from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/:id/containers/updated', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.users[0].id}/containers/updated`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedContainerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give an HTTP 200 when requesting own updated containers', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.users[0].id}/containers/updated`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when user requests updated containers (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/2/containers/updated')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests updated containers from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/containers/updated')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give correct owned updated containers for admin', async () => {
      const res = await request(ctx.app)
        .get('/users/2/containers/updated')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 404 when admin requests updated containers from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/containers/updated')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/:id/pointsofsale', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/users/1/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedContainerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give an HTTP 200 when requesting own points of sale', async () => {
      const res = await request(ctx.app)
        .get('/users/1/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when user requests points of sale (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/2/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests points of sale from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give correct owned points of sale for admin', async () => {
      const res = await request(ctx.app)
        .get('/users/2/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 404 when admin requests points of sale from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/:id/pointsofsale/updated', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.users[0].id}/pointsofsale/updated`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedUpdatedPointOfSaleResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give an HTTP 200 when requesting own updated points of sale', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.users[0].id}/pointsofsale/updated`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when user requests updated points of sale (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/2/pointsofsale/updated')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests updated points of sale from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/pointsofsale/updated')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give correct owned updated points of sale for admin', async () => {
      const res = await request(ctx.app)
        .get('/users/2/pointsofsale/updated')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 404 when admin requests updated points of sale from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/pointsofsale/updated')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/:id/transactions', () => {
    it('should return correct model', async () => {
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedTransactionResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give correct transactions from/to user', async () => {
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      const transactions = res.body.records as TransactionResponse[];

      const actualTransactions = await createQueryBuilder(Transaction, 'transaction')
        .leftJoinAndSelect('transaction.from', 'from')
        .leftJoinAndSelect('transaction.createdBy', 'createdBy')
        .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
        .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
        .leftJoin('transaction.subTransactions', 'subTransaction')
        .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
        .where('transaction.fromId = :userId OR transaction.createdById = :userId OR subTransaction.toId = :userId', { userId: user.id })
        .distinct(true)
        .getRawMany();

      expect(transactions.length).to.equal(Math.min(23, actualTransactions.length));
      expect(transactions.map((t) => t.id)).to.deep.equalInAnyOrder(
        actualTransactions.map((t) => t.transaction_id),
      );
    });
    it('should give an HTTP 403 when user requests transactions from someone else', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.users[0].id + 1}/transactions`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give transactions when admin requests transactions from someone else', async () => {
      const user = ctx.users[ctx.users.length - 3];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const transactions = res.body.records as TransactionResponse[];

      const actualTransactions = await createQueryBuilder(Transaction, 'transaction')
        .leftJoinAndSelect('transaction.from', 'from')
        .leftJoinAndSelect('transaction.createdBy', 'createdBy')
        .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
        .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
        .leftJoin('transaction.subTransactions', 'subTransaction')
        .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
        .where('transaction.fromId = :userId OR transaction.createdById = :userId OR subTransaction.toId = :userId', { userId: user.id })
        .distinct(true)
        .getRawMany();

      expect(transactions.length).to.equal(Math.min(23, actualTransactions.length));
      expect(transactions.map((t) => t.id)).to.deep.equalInAnyOrder(
        actualTransactions.map((t) => t.transaction_id),
      );
    });
    it('should give an HTTP 404 when admin requests transactions from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/12345/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });
  describe('GET /users/:id/transactions/report', () => {
    it.skip('should return the correct model', async () => {
      const user = ctx.transactions[0].subTransactions[0].to;
      const fromDate = new Date(2000, 0, 0);
      const tillDate = new Date(2050, 0, 0);
      const toId = user.id;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/transactions/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ toId, fromDate, tillDate });

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'TransactionReportResponse',
        res.body,
        true,
        true,
      );
      expect(validation.valid).to.be.true;
    });
    it('should create a transaction report', async () => {
      const user = ctx.transactions[0].subTransactions[0].to;
      const fromDate = new Date(2000, 0, 0);
      const tillDate = new Date(2050, 0, 0);
      const toId = user.id;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/transactions/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ toId, fromDate, tillDate });
      const report = res.body as TransactionReportResponse;

      expect(res.status).to.equal(200);

      const productSum = report.data.entries.reduce((sum, current) => {
        return sum += current.totalInclVat.amount;
      }, 0);
      const catSum = report.data.categories.reduce((sum, current) => {
        return sum += current.totalInclVat.amount;
      }, 0);
      const vatSum = report.data.vat.reduce((sum, current) => {
        return sum += current.totalInclVat.amount;
      }, 0);

      const transactions = (await TransactionService.getTransactions({ fromDate, tillDate, toId })).records;
      let sum = 0;
      transactions.forEach((t) => sum += t.value.amount);

      expect(productSum).to.equal(report.totalInclVat.amount);
      expect(catSum).to.equal(report.totalInclVat.amount);
      expect(vatSum).to.equal(report.totalInclVat.amount);
      expect(report.totalInclVat.amount).to.equal(sum);
    });
  });
  describe('GET /users/:id/transfers', () => {
    it('should return correct model', async () => {
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/transfers`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedTransferResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should give correct transfers from/to/created by user', async () => {
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/transfers`)
        .query({ take: 99999, skip: 0 })
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      const tranfers = res.body.records as TransferResponse[];

      const actualTransfers = await Transfer.createQueryBuilder('transfer')
        .select('transfer.id as id')
        .where('transfer.fromId = :userId or transfer.toId = :userId', { userId: user.id })
        .distinct(true)
        .getRawMany();
      expect(tranfers.length).to.equal(Math.min(23, actualTransfers.length));
      tranfers.forEach((t) => {
        const found = actualTransfers.find((at) => at.id === t.id);
        expect(found).to.not.be.undefined;
      });
    });
  });

  describe('GET /users/:id/financialmutations', () => {
    it('should return correct model', async () => {
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/financialmutations`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedFinancialMutationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/financialmutations`)
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const userTransactions = ctx.transactions.filter(
        (t) => t.from.id === user.id || t.createdBy.id === user.id,
      );
      const userTransfers = ctx.transfers.filter(
        (t) => t.from?.id === user.id || t.to?.id === user.id,
      );

      const mutations = res.body.records as FinancialMutationResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(userTransactions.length + userTransfers.length);
      expect(mutations.length).to.be.at.most(take);
    });
  });

  describe('POST /users/acceptToS', () => {
    let userNotAccepted: User;
    let userNotAcceptedToken: string;
    let userNotRequired: User;
    let userNotRequiredToken: string;

    const body: AcceptTosRequest = {
      extensiveDataProcessing: true,
    };

    before(async () => {
      userNotAccepted = await(await UserFactory({
        firstName: 'TestUser1',
        lastName: 'TestUser1',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: TermsOfServiceStatus.NOT_ACCEPTED,
      } as User)).get();
      userNotRequired = await (await UserFactory({
        firstName: 'TestUser2',
        lastName: 'TestUser2',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
      } as User)).get();
      ctx.users.push(userNotAccepted, userNotRequired);

      userNotAcceptedToken = await ctx.tokenHandler.signToken({ user: userNotAccepted, roles: ['User'], lesser: false }, '1');
      userNotRequiredToken = await ctx.tokenHandler.signToken({ user: userNotRequired, roles: ['User'], lesser: false }, '1');
    });

    it('should correctly accept ToS if not accepted', async () => {
      // Sanity check
      let user = await User.findOne({ where: { id: userNotAccepted.id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_ACCEPTED);

      const res = await request(ctx.app)
        .post('/users/acceptToS')
        .set('Authorization', `Bearer ${userNotAcceptedToken}`)
        .send(body);
      expect(res.status).to.equal(204);

      user = await User.findOne({ where: { id: userNotAccepted.id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.ACCEPTED);
      expect(user.extensiveDataProcessing).to.equal(true);
    });
    it('should correctly accept ToS if not required', async () => {
      // Sanity check
      let user = await User.findOne({ where: { id: userNotRequired.id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_REQUIRED);

      const res = await request(ctx.app)
        .post('/users/acceptToS')
        .set('Authorization', `Bearer ${userNotRequiredToken}`)
        .send({
          ...body,
          extensiveDataProcessing: false,
        } as AcceptTosRequest);
      expect(res.status).to.equal(204);

      user = await User.findOne({ where: { id: userNotRequired.id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.ACCEPTED);
      expect(user.extensiveDataProcessing).to.equal(false);
    });
    it('should return 400 if ToS already accepted', async () => {
      const { id } = ctx.users[0];

      // Sanity check
      const user = await User.findOne({ where: { id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.ACCEPTED);

      const res = await request(ctx.app)
        .post('/users/acceptToS')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(body);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('User already accepted ToS.');
    });
  });

  describe('POST /users/{id}/authenticate', () => {
    it('should return an HTTP 403 if unauthorized', async () => {
      const user = ctx.users[0];
      expect(await MemberAuthenticator
        .findOne({ where: { authenticateAs: { id: user.id } } })).to.be.null;

      const res = await request(ctx.app)
        .post(`/users/${user.id}/authenticate`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 200 if authorized', async () => {
      const user = ctx.users[1];
      expect(await MemberAuthenticator
        .find({ where: { authenticateAs: { id: user.id } } })).to.be.empty;
      const auth = Object.assign(new MemberAuthenticator(), {
        user: ctx.users[6],
        authenticateAs: user,
      });
      await auth.save();
      const res = await request(ctx.app)
        .post(`/users/${user.id}/authenticate`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
  });
  describe('PUT /users/{id}/authenticator/pin', () => {
    it('should return an HTTP 200 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const updatePinRequest: UpdatePinRequest = {
          pin: '1000',
        };
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/pin`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updatePinRequest);
        expect(res.status).to.equal(200);
      });
    });
    it('should return an 403 if unauthorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const updatePinRequest: UpdatePinRequest = {
          pin: '1000',
        };
        const res = await request(ctx.app)
          .put(`/users/${ctx.users[0].id}/authenticator/pin`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updatePinRequest);
        expect(res.status).to.equal(403);
      });
    });
    it('should return an 400 if pin is not 4 numbers', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const updatePinRequest: UpdatePinRequest = {
          pin: 'wrong',
        };
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/pin`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updatePinRequest);
        expect(res.body).to.be.equal(INVALID_PIN().value);
        expect(res.status).to.equal(400);
      });
    });
    it('should return an 404 if the user does not exists', async () => {
      const updatePinRequest: UpdatePinRequest = {
        pin: '1000',
      };
      const res = await request(ctx.app)
        .put(`/users/${(await User.count()) + 1}/authenticator/pin`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(updatePinRequest);
      expect(res.status).to.equal(404);
    });
  });
  describe('PUT /users/{id}/authenticator/local', () => {
    it('should return an HTTP 200 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const updateLocalRequest: UpdateLocalRequest = {
          password: 'P4ssword1!@',
        };
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/local`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateLocalRequest);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an HTTP 400 if the password is weak', async () => {
      const updateLocalRequest: UpdateLocalRequest = {
        password: 'weak',
      };
      const res = await request(ctx.app)
        .put(`/users/${ctx.users[6].id}/authenticator/local`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(updateLocalRequest);
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if user does not exists', async () => {
      const updateLocalRequest: UpdateLocalRequest = {
        password: 'P4ssword1!@',
      };
      const res = await request(ctx.app)
        .put(`/users/${(await User.count() + 1)}/authenticator/local`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(updateLocalRequest);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if unauthorized', async () => {
      const updateLocalRequest: UpdateLocalRequest = {
        password: 'P4ssword1!@',
      };
      const res = await request(ctx.app)
        .put(`/users/${ctx.users[6].id}/authenticator/local`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(updateLocalRequest);
      expect(res.status).to.equal(403);
    });
  });
  describe('GET /users/{id}/authenticate', () => {
    it('should return an HTTP 200 and all users that user can authenticate as', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const auth = Object.assign(new MemberAuthenticator(), {
          user,
          authenticateAs: ctx.users[0],
        });
        await auth.save();
        const auths = (await MemberAuthenticator.find({ where: { user: { id: user.id } }, relations: ['authenticateAs'] })).map((u) => u.authenticateAs.id);

        const res = await request(ctx.app)
          .get(`/users/${user.id}/authenticate`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(200);
        expect((res.body as UserResponse[]).map((u) => u.id))
          .to.deep.equalInAnyOrder(auths);
      });
    });
    it('should return an HTTP 404 if user does not exist', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User', 'Admin'], lesser: false }, '1');

        const res = await request(ctx.app)
          .get('/users/0/authenticate')
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(404);
      });
    });
    it('should return an HTTP 403 if insufficient rights', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const res = await request(ctx.app)
          .get(`/users/${ctx.users[0].id}/authenticate`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(403);
      });
    });
  });
  describe('GET /users/{id}/roles', () => {
    it('should return correct model', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const res = await request(ctx.app)
          .get(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${userToken}`);

        expect((res.body as RoleResponse[]).map((r) => r.role)).to.deep.equalInAnyOrder(['User']);
        expect(res.status).to.equal(200);
        expect(ctx.specification.validateModel(
          'Array.<RoleResponse.model>',
          res.body,
          false,
          true,
        ).valid).to.be.true;
      });
    });
    it('should return an HTTP 200 and the users roles', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const res = await request(ctx.app)
          .get(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${userToken}`);

        expect((res.body as RoleResponse[]).map((r) => r.role)).to.deep.equalInAnyOrder(['User']);
        expect(res.status).to.equal(200);
      });
    });
    it('should return an HTTP 404 if user does not exist', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User', 'Admin'], lesser: false }, '1');

        const res = await request(ctx.app)
          .get('/users/0/roles')
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(404);
      });
    });
    it('should return an HTTP 403 if insufficient rights', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'], lesser: false }, '1');

        const res = await request(ctx.app)
          .get(`/users/${ctx.users[0].id}/roles`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(403);
      });
    });
  });
  describe('GET /users/{id}/deposits', () => {
    it('should return all processing deposits', async () => {
      const res = await request(ctx.app)
        .get(`/users/${ctx.users[0].id}/deposits`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      res.body.forEach((b: StripeDepositResponse) => {
        const validation = ctx.specification.validateModel(
          'StripeDepositResponse',
          b,
          false,
          true,
        );
        expect(validation.valid).to.be.true;
      });
    });
    it('should return 404 if user does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/999999999/deposits')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Unknown user ID.');
    });
  });
  describe('getAttributes function', () => {
    it('should return all defined properties', async () => {
      const update: UpdateUserRequest = {
        ofAge: true,
        email: 'test',
        deleted: true,
      };
      const req = {
        body: update,
      } as RequestWithToken;
      const result = UserController.getAttributes(req);
      expect(result).to.deep.equalInAnyOrder(['ofAge', 'email', 'deleted']);
    });
  });
});
