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

import express, { Application } from 'express';
import chai, { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import { json } from 'body-parser';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { describe } from 'mocha';
import UserController from '../../../src/controller/user-controller';
import TransactionController from '../../../src/controller/transaction-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Product from '../../../src/entity/product/product';
import Transaction from '../../../src/entity/transactions/transaction';
import TokenHandler from '../../../src/authentication/token-handler';
import Database, { AppDataSource } from '../../../src/database/database';
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
import OrganMembership from '../../../src/entity/organ/organ-membership';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import UpdatePinRequest from '../../../src/controller/request/update-pin-request';
import {
  DUPLICATE_TOKEN,
  INVALID_PIN,
  ZERO_LENGTH_STRING,
} from '../../../src/controller/request/validators/validation-errors';
import { PaginatedUserResponse, UserResponse } from '../../../src/controller/response/user-response';
import RoleResponse from '../../../src/controller/response/rbac/role-response';
import {
  FinancialMutationResponse,
  PaginatedFinancialMutationResponse,
} from '../../../src/controller/response/financial-mutation-response';
import UpdateLocalRequest from '../../../src/controller/request/update-local-request';
import { AcceptTosRequest } from '../../../src/controller/request/accept-tos-request';
import { CreateUserRequest, UpdateUserRequest } from '../../../src/controller/request/user-request';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import { StripeDepositResponse } from '../../../src/controller/response/stripe-response';
import { TransactionReportResponse } from '../../../src/controller/response/transaction-report-response';
import { TransactionFilterParameters } from '../../../src/service/transaction-service';
import UpdateNfcRequest from '../../../src/controller/request/update-nfc-request';
import UserFineGroup from '../../../src/entity/fine/userFineGroup';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { SeededRole } from '../../seed/rbac-seeder';
import { createTransactions, createValidTransactionRequest } from '../../helpers/transaction-factory';
import { ReportResponse } from '../../../src/controller/response/report-response';
import TransactionService from '../../../src/service/transaction-service';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import { toMySQLString } from '../../../src/helpers/timestamps';
import sinon from 'sinon';
import { Client } from 'pdf-generator-client';
import { BasePdfService } from '../../../src/service/pdf/pdf-service';
import { RbacSeeder } from '../../seed';
import Dinero from 'dinero.js';
import NfcAuthenticator from '../../../src/entity/authenticator/nfc-authenticator';
import AssignedRole from '../../../src/entity/rbac/assigned-role';
import Wrapped from '../../../src/entity/wrapped';

chai.use(deepEqualInAnyOrder);

describe('UserController', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserController,
    userToken: string,
    adminToken: string,
    organMemberToken: string,
    deletedUser: User,
    user: CreateUserRequest,
    organ: User,
    tokenHandler: TokenHandler,
    users: User[],
    roles: SeededRole[],
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
    userFineGroups: UserFineGroup[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    ctx = { connection } as any; // on timeout forces connection to close
    const app = express();
    const database = await seedDatabase(new Date('2020-01-01T00:00:00.000Z'), new Date('2023-12-30T23:59:59.000Z'));
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
        canGoIntoDebt: true,
        ofAge: true,
      } as CreateUserRequest,
      ...database,
      roles: [],
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

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const organ = { organ: new Set<string>(['*']) };
    const roles = await new RbacSeeder().seed([{
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
          create: all,
          update: all,
          delete: all,
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
          delete: all,
          create: all,
        },
        Fine: {
          get: all,
          delete: all,
        },
        Wrapped: {
          get: all,
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        User: {
          get: own,
          acceptToS: own,
          update: { own: new Set<string>(['firstName', 'lastName', 'extensiveDataProcessing', 'settings']) },
        },
        Product: {
          get: own,
          update: own,
        },
        Authenticator: {
          update: { own: new Set<string>(['pin', 'password', 'nfcCode', 'key']) },
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
          create: own,
          update: own,
          delete: own,
        },
        Transfer: {
          get: own,
        },
        Wrapped: {
          get: own,
          update: own,
        },
      },
      assignmentCheck: async () => true,
    }, {
      name: 'Seller',
      permissions: {
        User: {
          get: organ,
        },
      },
      assignmentCheck: async (user) => user.id === ctx.users[7].id,
    }]);
    const roleManager = await new RoleManager().initialize();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.tokenHandler = tokenHandler;
    ctx.userToken = await tokenHandler.signToken(await new RbacSeeder().getToken(ctx.users[0], roles), '1');
    ctx.adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(ctx.users[6], roles), '1');
    ctx.organMemberToken = await tokenHandler.signToken(await new RbacSeeder().getToken(ctx.users[7], roles, [ctx.organ]), '1');
    ctx.roles = roles;

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new UserController({
      specification: ctx.specification,
      roleManager,
    }, tokenHandler);

    const transactionController = new TransactionController({
      specification: ctx.specification,
      roleManager,
    });

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/users', ctx.controller.getRouter());
    ctx.app.use('/transactions', transactionController.getRouter());

    await Promise.all(ctx.userFineGroups.map(async (g) => {
      g.user.currentFines = g;
      await g.user.save();
    }));
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /users', () => {
    async function queryUserBackend(searchQuery: string) {
      return User.find({ where: { deleted: false } }).then((users) => users.filter((user) => {
        const fullName = `${user.firstName} ${user.lastName}`;
        return (
          user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }));
    }

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
    it('should return correct user using search', async () => {
      const searchQuery = 'Firstname1 Last';
      const take = 50;
      const res = await request(ctx.app)
        .get('/users')
        .query({ search: searchQuery, take })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const filteredUsers = await queryUserBackend(searchQuery);
      expect(filteredUsers).length.to.gt(0);
      const users = res.body.records as UserResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      const spec = await Swagger.importSpecification();

      users.forEach((user: UserResponse) => {
        verifyUserResponse(spec, user);
      });

      const ids = users.map((u) => u.id);
      filteredUsers.forEach((u) => {
        expect(ids).to.includes(u.id);
      });

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(0);

    });
    it('should return correct user using search on nickname', async () => {
      const searchQuery = ctx.users.find((u) => u.nickname != null).nickname;
      const res = await request(ctx.app)
        .get('/users')
        .query({ search: searchQuery })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const filteredUsers = await queryUserBackend(searchQuery);

      const users = res.body.records as UserResponse[];
      const ids = users.map((u) => u.id);
      filteredUsers.forEach((u) => {
        expect(ids).to.includes(u.id);
      });
    });
    it('should give HTTP 200 when correctly creating and searching for a user', async () => {
      const user: CreateUserRequest = {
        firstName: 'Één bier',
        lastName: 'is geen bier',
        type: UserType.LOCAL_USER,
        email: 'spam@gewis.nl',
        canGoIntoDebt: true,
        ofAge: true,
      };

      // Create the user
      const createUserRes = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(user);
      expect(createUserRes.status).to.equal(201);

      // Search for the user
      const searchQuery = 'Één bier';
      const searchRes = await request(ctx.app)
        .get('/users')
        .query({ search: searchQuery })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(searchRes.status).to.equal(200);

      const filteredUsers = await queryUserBackend(searchQuery);
      expect(filteredUsers).length.to.be.gt(0);
      expect(searchRes.body.records.length).to.equal(filteredUsers.length);
    });
  });

  describe('GET /users/nfc/:id', () => {
    it('should return correct model', async () => {
      const user = ctx.users[0];
      const nfc = await NfcAuthenticator.save({
        userId: user.id,
        nfcCode: 'vo-de-ledenABC41',
      });
      const res = await request(ctx.app)
        .get(`/users/nfc/${nfc.nfcCode}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel('UserResponse', res.body, false, true).valid).to.be.true;
    });
    it('should return an HTTP 404 if the nfc code does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/nfc/12345')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Unknown nfc code');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const user = ctx.users[0];
      const nfc = await NfcAuthenticator.save({
        userId: user.id,
        nfcCode: 'vo-de-ledenABC41',
      });
      const res = await request(ctx.app)
        .get(`/users/nfc/${nfc.nfcCode}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should return the correct user if nfc code is correct', async () => {
      const user = ctx.users[0];
      const nfc = await NfcAuthenticator.save({
        userId: user.id,
        nfcCode: 'vo-de-ledenABC41',
      });
      const res = await request(ctx.app)
        .get(`/users/nfc/${nfc.nfcCode}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'UserResponse',
        res.body,
      ).valid).to.be.true;
      expect(res.body.id).to.equal(user.id);
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
        'UserResponse',
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
        'UserResponse',
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
      const validation = ctx.specification.validateModel(
        'PaginatedUserResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
      expect(res.body.records.length).to.be.greaterThan(0);
    });
    it('should return an HTTP 200 and all the members of the organ', async () => {
      await inUserContext(await (await UserFactory()).clone(3), async (...users: User[]) => {
        const organ = (await User.find({ where: { type: UserType.ORGAN } }))[2];
        const promises: Promise<OrganMembership>[] = [];
        users.forEach((user, index) => {
          const auth = Object.assign(new OrganMembership(), {
            user,
            organ,
            index,
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
    it('should give HTTP 400 if lastName is too long', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' });
      expect(res.status).to.equal(400);
    });
    it('should correctly change nickname if requester is admin', async () => {
      const nickname = 'SudoSOSFeut';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ nickname });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.nickname).to.deep.equal(nickname);
      verifyUserResponse(spec, user);
    });
    it('should give HTTP 400 if nickName is too long', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ nickname: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' });
      expect(res.status).to.equal(400);
    });
    it('should correctly remove nickname if set to empty string', async () => {
      const user = ctx.users.find((u) => u.nickname != null);

      const res = await request(ctx.app)
        .patch('/users/' + user.id)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ nickname: '' });
      expect(res.status).to.equal(200);

      const userResponse = res.body as UserResponse;
      expect(userResponse.nickname).to.be.null;
      expect((await User.findOne({ where: { id: user.id } })).nickname).to.be.null;
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
    it('should allow user to update extensiveDataProcessing', async () => {
      const processing = ctx.users[0].extensiveDataProcessing;

      const res = await request(ctx.app)
        .patch(`/users/${ctx.users[0].id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ extensiveDataProcessing: !processing });
      expect(res.status).to.equal(200);

      const user = res.body as UserResponse;
      const spec = await Swagger.importSpecification();
      expect(user.extensiveDataProcessing).to.deep.equal(!processing);
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

  describe('GET /users/:id/pointsofsale', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/users/1/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'PaginatedPointOfSaleResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
      expect(res.body.records.length).to.be.greaterThan(0);
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

      const actualTransactions = await ctx.connection.createQueryBuilder(Transaction, 'transaction')
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

      const actualTransactions = await ctx.connection.createQueryBuilder(Transaction, 'transaction')
        .leftJoinAndSelect('transaction.from', 'from')
        .leftJoinAndSelect('transaction.createdBy', 'createdBy')
        .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
        .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
        .leftJoin('transaction.subTransactions', 'subTransaction')
        .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
        .where('transaction.fromId = :userId OR subTransaction.toId = :userId', { userId: user.id })
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
    it('should return the correct model', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createTransactions(debtor.id, creditor.id, 3);
        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
        const validation = ctx.specification.validateModel(
          'TransactionReportResponse',
          res.body,
          false,
          true,
        );
        expect(validation.valid).to.be.true;
      });
    });
    it('should create a transaction report', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
        const report = res.body as TransactionReportResponse;

        const productSum = report.data.entries.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const catSum = report.data.categories.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const vatSum = report.data.vat.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);

        expect(productSum).to.equal(report.totalInclVat.amount);
        expect(catSum).to.equal(report.totalInclVat.amount);
        expect(vatSum).to.equal(report.totalInclVat.amount);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
    it('should validate transaction filters', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const parameters: TransactionFilterParameters = {
          fromDate: 'string' as unknown as Date,
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
    });
    it('should thrown an HTTP 404 if user is undefined', async () => {
      const parameters: TransactionFilterParameters = {
        fromDate: new Date(2000, 0, 0),
        tillDate: new Date(2050, 0, 0),
        toId: 1,
      };
      const count = await User.count();
      const id = count + 1;
      const user = await User.findOne({ where: { id } });
      expect(user).to.be.null;
      const res = await request(ctx.app)
        .get(`/users/${id}/transactions/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query(parameters);
      expect(res.status).to.equal(404);
    });
    it('should thrown an HTTP 400 if to and form are both undefined', async () => {
      const parameters: TransactionFilterParameters = {
        fromDate: new Date(2000, 0, 0),
        tillDate: new Date(2050, 0, 0),
      };

      const res = await request(ctx.app)
        .get('/users/1/transactions/report')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query(parameters);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Need to provide either a toId or a fromId.');
    });
    it('should thrown an HTTP 400 if both to and from are defined', async () => {
      const parameters: TransactionFilterParameters = {
        fromDate: new Date(2000, 0, 0),
        tillDate: new Date(2050, 0, 0),
        toId: 1,
        fromId: 1,
      };

      const res = await request(ctx.app)
        .get('/users/1/transactions/report')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query(parameters);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Need to provide either a toId or a fromId.');
    });
  });
  describe('GET /users/:id/transfers', () => {
    it('should return correct model', async () => {
      const user = ctx.users[0];
      const res = await request(ctx.app)
        .get(`/users/${user.id}/transfers`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'PaginatedTransferResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
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
        false,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 with only mutations after a certain date', async () => {
      const user = ctx.transactions[0].subTransactions[0].to;
      const transaction = ctx.transactions.filter((t) => t.subTransactions.some((s) => s.to.id === user.id))[2];
      const fromDate = transaction.createdAt;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/financialmutations?fromDate=${fromDate.toISOString()}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions
        .filter((t) => (t.from.id === user.id || t.createdBy.id === user.id || t.subTransactions.some((s) => s.to.id === user.id))
          && t.createdAt >= fromDate);
      expect(actualTransactions.length).to.be.at.least(1);
      const actualTransfers = ctx.transfers
        .filter((t) => (t.from?.id === user.id || t.to?.id === user.id)
          && t.createdAt >= fromDate);
      expect(actualTransfers.length).to.be.at.least(1);

      const body = res.body as PaginatedFinancialMutationResponse;
      expect(body.records.filter((r) => r.type === 'transfer')).to.be.lengthOf(actualTransfers.length);
      expect(body.records.filter((r) => r.type === 'transaction')).to.be.lengthOf(actualTransactions.length);
      body.records.forEach((t) => {
        expect(new Date(t.mutation.createdAt)).to.be.greaterThanOrEqual(fromDate);
      });
    });
    it('should return an HTTP 200 with only mutations before a certain date', async () => {
      const user = ctx.transactions[0].from;
      const transaction = ctx.transactions.filter((t) => t.subTransactions.some((s) => s.to.id === user.id))[0];
      const tillDate = transaction.createdAt;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/financialmutations?tillDate=${tillDate.toISOString()}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const actualTransactions = ctx.transactions
        .filter((t) => (t.from.id === user.id || t.createdBy.id === user.id || t.subTransactions.some((s) => s.to.id === user.id))
          && t.createdAt < tillDate);
      expect(actualTransactions.length).to.be.at.least(1);
      const actualTransfers = ctx.transfers
        .filter((t) => (t.from?.id === user.id || t.to?.id === user.id)
          && t.createdAt < tillDate);
      expect(actualTransfers.length).to.be.at.least(1);

      const body = res.body as PaginatedFinancialMutationResponse;
      expect(body.records.filter((r) => r.type === 'transfer')).to.be.lengthOf(actualTransfers.length);
      expect(body.records.filter((r) => r.type === 'transaction')).to.be.lengthOf(actualTransactions.length);
      body.records.forEach((t) => {
        expect(new Date(t.mutation.createdAt)).to.be.lessThanOrEqual(tillDate);
      });
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
      userNotAccepted = await (await UserFactory({
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

      userNotAcceptedToken = await ctx.tokenHandler.signToken({ user: userNotAccepted, roles: ['User'] }, '1');
      userNotRequiredToken = await ctx.tokenHandler.signToken({ user: userNotRequired, roles: ['User'] }, '1');
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

  describe('PUT /users/{id}/authenticator/pin', () => {
    it('should return an HTTP 204 if authorized', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updatePinRequest: UpdatePinRequest = {
          pin: '1000',
        };
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/pin`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updatePinRequest);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an 403 if unauthorized', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

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
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

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
  describe('PUT /users/{id}/authenticator/nfc', () => {
    it('should return an HTTP 204 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: 'correctNfcCode',
        };
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an 400 if duplicate nfc', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: 'dupplicateNfcCode',
        };
        await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);
        expect(res.body).to.be.equal(DUPLICATE_TOKEN().value);
        expect(res.status).to.equal(400);
      });
    });
    it('should return an 200 if updating to a valid nfc', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest1: UpdateNfcRequest = {
          nfcCode: 'correctNfcCode1',
        };
        const res1 = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest1);
        expect(res1.status).to.equal(204);

        const updateNfcRequest2: UpdateNfcRequest = {
          nfcCode: 'correctNfcCode2',
        };
        const res2 = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest2);
        expect(res2.status).to.equal(204);
      });
    });
    it('should return an 400 if empty nfc', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: '',
        };
        const res = await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);
        expect(res.body).to.be.equal(ZERO_LENGTH_STRING().value);
        expect(res.status).to.equal(400);
      });
    });
    it('should return an 403 if unauthorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: 'wrongNfcCode',
        };
        const res = await request(ctx.app)
          .put(`/users/${ctx.users[0].id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);
        expect(res.status).to.equal(403);
      });
    });
    it('should return an 404 if the user does not exists', async () => {
      const updateNfcRequest: UpdateNfcRequest = {
        nfcCode: 'validNfcRequest',
      };
      const res = await request(ctx.app)
        .put(`/users/${(await User.count()) + 1}/authenticator/nfc`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(updateNfcRequest);
      expect(res.status).to.equal(404);
    });
  });
  describe('DELETE /users/{id}/authenticator/nfc', () => {
    it('should return an HTTP 204 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: 'toBeDeletedNfcRequest',
        };
        await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an 404 if the user does not exists', async () => {
      const res = await request(ctx.app)
        .delete(`/users/${(await User.count()) + 1}/authenticator/nfc`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if user has no nfc', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(403);
      });
    });
  });
  describe('DELETE /users/{id}/authenticator/nfc', () => {
    it('should return an HTTP 204 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: 'toBeDeletedNfcRequest',
        };
        await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an 404 if the user does not exists', async () => {
      const res = await request(ctx.app)
        .delete(`/users/${(await User.count()) + 1}/authenticator/nfc`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if user has no nfc', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(403);
      });
    });
  });
  describe('PUT /users/{id}/authenticator/local', () => {
    it('should return an HTTP 200 if authorized', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const updateNfcRequest: UpdateNfcRequest = {
          nfcCode: 'toBeDeletedNfcRequest',
        };
        await request(ctx.app)
          .put(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`)
          .send(updateNfcRequest);

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an 404 if the user does not exists', async () => {
      const res = await request(ctx.app)
        .delete(`/users/${(await User.count()) + 1}/authenticator/nfc`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if user has no nfc', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/nfc`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(403);
      });
    });
  });
  describe('PUT /users/{id}/authenticator/local', () => {
    it('should return an HTTP 204 if authorized', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

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
  describe('POST /users/{id}/authenticator/key', () => {
    it('should return an HTTP 200 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .post(`/users/${user.id}/authenticator/key`)
          .set('Authorization', `Bearer ${userToken}`)
          .send();
        expect(res.status).to.equal(200);
        expect(ctx.specification.validateModel(
          'UpdateKeyResponse',
          res.body,
          false,
          true,
        ).valid).to.be.true;
      });
    });
    it('should return an 403 if unauthorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .post(`/users/${ctx.users[0].id}/authenticator/key`)
          .set('Authorization', `Bearer ${userToken}`)
          .send();
        expect(res.status).to.equal(403);
      });
    });
    it('should return an 404 if the user does not exists', async () => {

      const res = await request(ctx.app)
        .post(`/users/${(await User.count()) + 1}/authenticator/key`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();
      expect(res.status).to.equal(404);
    });
  });
  describe('DELETE /users/{id}/authenticator/key', () => {
    it('should return an HTTP 200 if authorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/authenticator/key`)
          .set('Authorization', `Bearer ${userToken}`)
          .send();
        expect(res.status).to.equal(204);
      });
    });
    it('should return an 403 if unauthorized', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

        const res = await request(ctx.app)
          .delete(`/users/${ctx.users[0].id}/authenticator/key`)
          .set('Authorization', `Bearer ${userToken}`)
          .send();
        expect(res.status).to.equal(403);
      });
    });
    it('should return an 404 if the user does not exists', async () => {

      const res = await request(ctx.app)
        .delete(`/users/${(await User.count()) + 1}/authenticator/key`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /users/{id}/roles', () => {
    it('should return correct model', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(user, ctx.roles), '1');

        const res = await request(ctx.app)
          .get(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${userToken}`);

        expect((res.body as RoleResponse[]).map((r) => r.name)).to.deep.equalInAnyOrder(['User']);
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
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(user, ctx.roles), '1');

        const res = await request(ctx.app)
          .get(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${userToken}`);

        expect((res.body as RoleResponse[]).map((r) => r.name)).to.deep.equalInAnyOrder(['User']);
        expect(res.status).to.equal(200);
      });
    });
    it('should return an HTTP 404 if user does not exist', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User', 'Admin'] }, '1');

        const res = await request(ctx.app)
          .get('/users/0/roles')
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(404);
      });
    });
    it('should return an HTTP 403 if insufficient rights', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const userToken = await ctx.tokenHandler.signToken({ user, roles: ['User'] }, '1');

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
          false,
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
  describe('POST /users/{id}/fines/waive', () => {
    it("should correctly waive all user's fines", async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      const amount = user.currentFines!.fines.reduce((total, f) => total.add(f.amount), Dinero());

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .send({ amount: amount.toObject() })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbUser = await User.findOne({ where: { id: user.id }, relations: { currentFines: true } });
      expect(dbUser.currentFines).to.be.null;
      const dbFineGroup = await UserFineGroup.findOne({ where: { id: user.currentFines!.id }, relations: { waivedTransfer: true } });
      expect(dbFineGroup.waivedTransfer).to.not.be.null;
      expect(dbFineGroup.waivedTransfer.amountInclVat.getAmount()).to.equal(amount.getAmount());

      // Cleanup
      await Transfer.remove(dbFineGroup.waivedTransfer);
      await User.save(user);
    });
    it("should correctly waive a part of a user's fines", async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      const amount = Dinero({ amount: 50 });

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .send({ amount: amount.toObject() })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbUser = await User.findOne({ where: { id: user.id }, relations: { currentFines: true } });
      expect(dbUser.currentFines).to.not.be.null;
      const dbFineGroup = await UserFineGroup.findOne({ where: { id: user.currentFines!.id }, relations: { waivedTransfer: true } });
      expect(dbFineGroup.waivedTransfer).to.not.be.null;
      expect(dbFineGroup.waivedTransfer.amountInclVat.getAmount()).to.equal(amount.getAmount());

      // Cleanup
      await Transfer.remove(dbFineGroup.waivedTransfer);
      await User.save(user);
    });
    it("should correctly waive all user's fines if no body is given", async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      const amount = user.currentFines!.fines.reduce((total, f) => total.add(f.amount), Dinero());

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbUser = await User.findOne({ where: { id: user.id }, relations: { currentFines: true } });
      expect(dbUser.currentFines).to.be.null;
      const dbFineGroup = await UserFineGroup.findOne({ where: { id: user.currentFines!.id }, relations: { waivedTransfer: true } });
      expect(dbFineGroup.waivedTransfer).to.not.be.null;
      expect(dbFineGroup.waivedTransfer.amountInclVat.getAmount()).to.equal(amount.getAmount());

      // Cleanup
      await Transfer.remove(dbFineGroup.waivedTransfer);
      await User.save(user);
    });
    it("should correctly waive all user's fines if an empty body is given", async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      const amount = user.currentFines!.fines.reduce((total, f) => total.add(f.amount), Dinero());

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .send({})
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbUser = await User.findOne({ where: { id: user.id }, relations: { currentFines: true } });
      expect(dbUser.currentFines).to.be.null;
      const dbFineGroup = await UserFineGroup.findOne({ where: { id: user.currentFines!.id }, relations: { waivedTransfer: true } });
      expect(dbFineGroup.waivedTransfer).to.not.be.null;
      expect(dbFineGroup.waivedTransfer.amountInclVat.getAmount()).to.equal(amount.getAmount());

      // Cleanup
      await Transfer.remove(dbFineGroup.waivedTransfer);
      await User.save(user);
    });
    it('should return 400 if amount to waive is zero', async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      const amount = Dinero({ amount: 0 });

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .send({ amount: amount.toObject() })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Amount to waive cannot be zero or negative.');
    });
    it('should return 400 if amount to waive is negative', async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      const amount = Dinero({ amount: -100 });

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .send({ amount: amount.toObject() })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Amount to waive cannot be zero or negative.');
    });
    it('should return 400 if amount to waive is more than the user\'s fines', async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.not.be.null;
      let amount = user.currentFines!.fines.reduce((total, f) => total.add(f.amount), Dinero());
      amount = amount.add(Dinero({ amount: 100 }));

      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .send({ amount: amount.toObject() })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Amount to waive cannot be more than the total amount of fines.');
    });
    it('should return 400 if user has no fines', async () => {
      const user = ctx.users.find((u) => u.currentFines == null);
      expect((await User.findOne({ where: { id: user.id }, relations: { currentFines: true } })).currentFines).to.be.null;
      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('User has no fines.');
    });
    it('should return 404 if user does not exist', async () => {
      const res = await request(ctx.app)
        .post('/users/999999999/fines/waive')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Unknown user ID.');
    });
    it('should return 404 if user is not admin', async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      const res = await request(ctx.app)
        .post(`/users/${user.id}/fines/waive`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });
  describe('GET /users/{id}/transactions/sales/report', () => {
    it('should return the correct model', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createTransactions(debtor.id, creditor.id, 3);
        const parameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/sales/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
        const validation = ctx.specification.validateModel(
          'ReportResponse',
          res.body,
          false,
          false,
        );
        expect(validation.valid).to.be.true;
      });
    });
    it('should create a transaction report', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/sales/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
        const report = res.body as ReportResponse;

        const productSum = report.data.products.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const catSum = report.data.categories.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const vatSum = report.data.vat.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);

        expect(productSum).to.equal(report.totalInclVat.amount);
        expect(catSum).to.equal(report.totalInclVat.amount);
        expect(vatSum).to.equal(report.totalInclVat.amount);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
    it('should validate transaction filters', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const parameters = {
          fromDate: 'string' as unknown as Date,
          tillDate: new Date(2050, 0, 0),
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/sales/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
    });
    it('should thrown an HTTP 404 if user is undefined', async () => {
      const parameters = {
        fromDate: new Date(2000, 0, 0),
        tillDate: new Date(2050, 0, 0),
      };
      const count = await User.count();
      const id = count + 1;
      const user = await User.findOne({ where: { id } });
      expect(user).to.be.null;
      const res = await request(ctx.app)
        .get(`/users/${id}/transactions/sales/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query(parameters);
      expect(res.status).to.equal(404);
    });
    it('should use transaction.createdAt for sales reports when editing transaction (GH#675)', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
        const txDate = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);

        const req = await createValidTransactionRequest(debtor.id, creditor.id);
        const transactionService = new TransactionService();
        const verification = await transactionService.verifyTransaction(req);
        if (!verification.valid || !verification.context) {
          throw new Error('Invalid transaction');
        }
        const tx = await transactionService.createTransaction(req, verification.context);

        // Set transaction createdAt to previous month
        const dateStr = toMySQLString(txDate);
        await AppDataSource.query(
          `UPDATE \`transaction\` SET createdAt = '${dateStr}' WHERE id = ${tx.id}`,
        );

        // Verify transaction appears in previous month's report
        let res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/sales/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({
            fromDate: monthStart.toISOString(),
            tillDate: monthEnd.toISOString(),
          });
        expect(res.status).to.equal(200);
        const reportBefore = res.body as ReportResponse;
        const amountBefore = reportBefore.totalInclVat.amount;
        expect(amountBefore).to.be.greaterThan(0);

        // Edit the transaction (this will recreate subTransactions with new createdAt)
        const updateReq: TransactionRequest = {
          ...req,
          subTransactions: req.subTransactions.map((st) => ({
            ...st,
            subTransactionRows: st.subTransactionRows.map((row) => ({
              ...row,
              amount: row.amount + 0,
            })),
          })),
        };

        res = await request(ctx.app)
          .patch(`/transactions/${tx.id}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(updateReq);
        expect(res.status).to.equal(200);

        // Verify transaction.createdAt is preserved
        const txAfter = await Transaction.findOne({
          where: { id: tx.id },
        });
        expect(txAfter.createdAt.getTime()).to.equal(txDate.getTime());

        // Verify transaction still appears in previous month's report (using transaction.createdAt)
        res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/sales/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({
            fromDate: monthStart.toISOString(),
            tillDate: monthEnd.toISOString(),
          });
        expect(res.status).to.equal(200);
        const reportAfter = res.body as ReportResponse;

        // Verify transaction does not appear in current month's report
        res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/sales/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({
            fromDate: monthEnd.toISOString(),
            tillDate: nextMonthEnd.toISOString(),
          });
        expect(res.status).to.equal(200);
        const reportNextMonth = res.body as ReportResponse;

        expect(reportAfter.totalInclVat.amount).to.equal(amountBefore);
        expect(reportNextMonth.totalInclVat.amount).to.equal(0);
      });
    });
  });
  describe('GET /users/{id}transactions/purchases/report', () => {
    it('should return the correct model', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createTransactions(debtor.id, creditor.id, 3);
        const parameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/purchases/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
        const validation = ctx.specification.validateModel(
          'ReportResponse',
          res.body,
          false,
          false,
        );
        expect(validation.valid).to.be.true;
      });
    });
    it('should create a transaction report', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
        };

        const res = await request(ctx.app)
          .get(`/users/${debtor.id}/transactions/purchases/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
        const report = res.body as ReportResponse;

        const productSum = report.data.products.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const catSum = report.data.categories.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const vatSum = report.data.vat.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);

        expect(productSum).to.equal(report.totalInclVat.amount);
        expect(catSum).to.equal(report.totalInclVat.amount);
        expect(vatSum).to.equal(report.totalInclVat.amount);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
    it('should validate transaction filters', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const parameters = {
          fromDate: 'string' as unknown as Date,
          tillDate: new Date(2050, 0, 0),
        };

        const res = await request(ctx.app)
          .get(`/users/${creditor.id}/transactions/purchases/report`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
    });
    it('should thrown an HTTP 404 if user is undefined', async () => {
      const parameters = {
        fromDate: new Date(2000, 0, 0),
        tillDate: new Date(2050, 0, 0),
      };
      const count = await User.count();
      const id = count + 1;
      const user = await User.findOne({ where: { id } });
      expect(user).to.be.null;
      const res = await request(ctx.app)
        .get(`/users/${id}/transactions/purchases/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query(parameters);
      expect(res.status).to.equal(404);
    });
  });
  describe('GET pdf', () => {
    let clientStub: sinon.SinonStubbedInstance<Client>;

    function resolveSuccessful() {
      clientStub.generateUserReport.resolves({
        data: new Blob(),
        status: 200,
      });
    }

    beforeEach(() => {
      clientStub = sinon.createStubInstance(Client);
      sinon.stub(BasePdfService, 'getClient').returns(clientStub);
    });

    afterEach(() => {
      sinon.restore();
    });

    describe('GET /users/{id}/transactions/sales/report/pdf', () => {
      it('should return 200 if admin', async () => {
        resolveSuccessful();
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
      });
      it('should return 502 if pdf generation fails', async () => {
        clientStub.generateUserReport.rejects(new Error('Failed to generate PDF'));
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(502);
      });
      it('should return 403 if not admin', async () => {
        const id = 2;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.userToken}`)
          .query(parameters);
        expect(res.status).to.equal(403);
      });
      it('should return 400 if fromDate is not a valid date', async () => {
        const id = 1;
        const parameters = { fromDate: '41Vooooo', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 400 if tillDate is not a valid date', async () => {
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '41Vooooo' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 400 if fromDate is not before tillDate', async () => {
        const id = 1;
        const parameters = { fromDate: '2022-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 400 if fileType is not a valid fileType', async () => {
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31', fileType: '39Vooooo' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 404 if user is undefined', async () => {
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const count = await User.count();
        const id = count + 1;
        const user = await User.findOne({ where: { id } });
        expect(user).to.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/sales/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(404);
      });
    });
    describe('GET /users/{id}/transactions/purchases/report/pdf', () => {
      it('should return 200 if admin', async () => {
        resolveSuccessful();
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(200);
      });
      it('should return 502 if pdf generation fails', async () => {
        clientStub.generateUserReport.rejects(new Error('Failed to generate PDF'));
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(502);
      });
      it('should return 403 if not admin', async () => {
        const id = 2;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.userToken}`)
          .query(parameters);
        expect(res.status).to.equal(403);
      });
      it('should return 400 if fromDate is not a valid date', async () => {
        const id = 1;
        const parameters = { fromDate: '41Vooooo', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 400 if tillDate is not a valid date', async () => {
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '41Vooooo' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 400 if fromDate is not before tillDate', async () => {
        const id = 1;
        const parameters = { fromDate: '2022-01-01', tillDate: '2021-12-31' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 400 if fileType is not a valid fileType', async () => {
        const id = 1;
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31', fileType: '39Vooooo' };
        const user = await User.findOne({ where: { id } });
        expect(user).to.not.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(400);
      });
      it('should return 404 if user is undefined', async () => {
        const parameters = { fromDate: '2021-01-01', tillDate: '2021-12-31' };
        const count = await User.count();
        const id = count + 1;
        const user = await User.findOne({ where: { id } });
        expect(user).to.be.null;
        const res = await request(ctx.app)
          .get(`/users/${id}/transactions/purchases/report/pdf`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query(parameters);
        expect(res.status).to.equal(404);
      });
    });
  });

  describe('DELETE /users/{id}/roles/{roleId}', () => {
    it('should return an HTTP 204 and remove the role from user if admin', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {

        // Create a new role
        const [role] = await new RbacSeeder().seed([{
          name: 'Test 1',
          permissions: {
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          assignmentCheck: async (_: User) => false,
        }]);

        // Assign the role to the user
        await AssignedRole.save({
          userId: user.id,
          roleId: role.role.id,
        });

        // Sanity check
        expect(await AssignedRole.findOne({ where: { userId: user.id, roleId: role.role.id } })).to.not.be.undefined;

        const res = await request(ctx.app)
          .delete(`/users/${user.id}/roles/${role.role.id}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);
        expect(res.status).to.equal(204);

        // Sanity check
        expect(await AssignedRole.findOne({ where: { userId: user.id, roleId: role.role.id } })).to.be.null;
      });
    });

    it('should return an HTTP 204 if user does not have the role', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const res = await request(ctx.app)
          .delete(`/users/${user.id}/roles/1`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);
        expect(res.status).to.equal(204);
      });
    });

    it('should return 403 if not admin', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const res = await request(ctx.app)
          .delete(`/users/${user.id}/roles/1`)
          .set('Authorization', `Bearer ${ctx.userToken}`);
        expect(res.status).to.equal(403);
      });

    });

    it('should return 404 if user does not exist', async () => {
      const res = await request(ctx.app)
        .delete('/users/999999999/roles/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('user not found');
    });

    it('should return 404 if role does not exist', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const res = await request(ctx.app)
          .delete(`/users/${user.id}/roles/999999999`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);
        expect(res.status).to.equal(404);
        expect(res.body).to.equal('role not found');
      });
    });
  });
  describe('POST /users/{id}/roles', () => {
    it('should return an HTTP 204 and add the role to user if admin', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        // Create a new role
        const [role] = await new RbacSeeder().seed([{
          name: 'Test 2',
          permissions: {
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          assignmentCheck: async (_: User) => false,
        }]);

        // Sanity check
        expect(await AssignedRole.findOne({ where: { userId: user.id, roleId: role.role.id } })).to.be.null;

        const res = await request(ctx.app)
          .post(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send({ roleId: role.role.id });
        expect(res.status).to.equal(204);

        // Sanity check
        expect(await AssignedRole.findOne({ where: { userId: user.id, roleId: role.role.id } })).to.not.be.null;
      });
    });
    it('should return an HTTP 404 if role does not exist', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const res = await request(ctx.app)
          .post(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send({ roleId: 999999999 });
        expect(res.status).to.equal(404);
        expect(res.body).to.equal('role not found');
      });
    });

    it('should return 403 if not admin', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const res = await request(ctx.app)
          .post(`/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${ctx.userToken}`)
          .send({ roleId: 1 });
        expect(res.status).to.equal(403);
      });
    });
  });

  describe('GET /users/:id/wrapped', () => {
    it('should return 200 with WrappedResponse when wrapped exists', async () => {
      const user = ctx.users[0]; // Use the user that has the token
      if (!user) return;

      // Create wrapped data
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 10,
        transactionPercentile: 75.5,
        transactionMaxDate: new Date(2023, 6, 15),
        transactionMaxAmount: 5,
        transactionHeatmap: JSON.stringify([1, 2, 3]),
        spentPercentile: 80.0,
        syncedFrom: new Date(2023, 0, 1),
        syncedTo: new Date(2023, 11, 31),
      });
      await Wrapped.save(wrapped);

      const res = await request(ctx.app)
        .get(`/users/${user.id}/wrapped`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('userId');
      expect(res.body).to.have.property('transactions');
      expect(res.body).to.have.property('spentPercentile');
      expect(res.body).to.have.property('syncedFrom');
      expect(res.body).to.have.property('syncedTo');
      expect(res.body).to.have.property('organs');
      expect(res.body.transactions).to.have.property('transactionCount');
      expect(res.body.transactions).to.have.property('transactionPercentile');
      expect(res.body.transactions).to.have.property('transactionMaxDate');
      expect(res.body.transactions).to.have.property('transactionMaxAmount');
      expect(res.body.transactions).to.have.property('transactionHeatmap');
    });

    it('should return 404 when wrapped not found', async () => {
      const user = ctx.users[0]; // Use the user that has the token
      if (!user) return;

      // Ensure no wrapped exists
      await Wrapped.delete({ userId: user.id });

      const res = await request(ctx.app)
        .get(`/users/${user.id}/wrapped`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Wrapped not found for user');
    });

    it('should validate authorization policy (own)', async () => {
      const user = ctx.users[0]; // Use the user that has the token
      if (!user) return;

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 5,
        transactionPercentile: 50.0,
        transactionMaxDate: new Date(2023, 5, 15),
        transactionMaxAmount: 3,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 60.0,
        syncedFrom: new Date(2023, 0, 1),
        syncedTo: new Date(),
      });
      await Wrapped.save(wrapped);

      // Reload user without relations to avoid circular references
      const freshUser = await User.findOne({ where: { id: user.id } });
      if (!freshUser) return;

      // Create token for the same user using RbacSeeder to avoid circular references
      const userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(freshUser, ctx.roles), '1');

      const res = await request(ctx.app)
        .get(`/users/${user.id}/wrapped`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(200);
    });

    it('should return 403 when user cannot access wrapped (all)', async () => {
      const user = ctx.users[0]; // Use a regular user
      const otherUser = ctx.users.find((u) => u.id !== user.id && u.extensiveDataProcessing && u.active && !u.deleted);
      if (!user || !otherUser) return;

      const wrapped = Object.assign(new Wrapped(), {
        userId: otherUser.id,
        transactionCount: 5,
        transactionPercentile: 50.0,
        transactionMaxDate: new Date(2023, 5, 15),
        transactionMaxAmount: 3,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 60.0,
        syncedFrom: new Date(2023, 0, 1),
        syncedTo: new Date(),
      });
      await Wrapped.save(wrapped);

      // Reload user without relations to avoid circular references
      const freshUser = await User.findOne({ where: { id: user.id } });
      if (!freshUser) return;

      // Create token for different user without 'all' permission
      const userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(freshUser, ctx.roles), '1');

      const res = await request(ctx.app)
        .get(`/users/${otherUser.id}/wrapped`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(403);
    });

    it('should include organ member data in response', async () => {
      const user = ctx.users[0]; // Use the user that has the token
      if (!user) return;

      const WrappedOrganMember = (await import('../../../src/entity/wrapped/wrapped-organ-member')).default;

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 5,
        transactionPercentile: 50.0,
        transactionMaxDate: new Date(2023, 5, 15),
        transactionMaxAmount: 3,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 60.0,
        syncedFrom: new Date(2023, 0, 1),
        syncedTo: new Date(),
      });
      await Wrapped.save(wrapped);

      const organMember = Object.assign(new WrappedOrganMember(), {
        userId: user.id,
        organId: ctx.organ.id,
        ordinalTransactionCreated: 0,
        ordinalTurnoverCreated: 1,
      });
      await ctx.connection.manager.save(organMember);

      const res = await request(ctx.app)
        .get(`/users/${user.id}/wrapped`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.organs).to.be.an('array');
      if (res.body.organs.length > 0) {
        expect(res.body.organs[0]).to.have.property('organId');
        expect(res.body.organs[0]).to.have.property('ordinalTransactionCreated');
        expect(res.body.organs[0]).to.have.property('ordinalTurnoverCreated');
      }
    });
  });

  describe('POST /users/:id/wrapped', () => {
    it('should return 200 after successful computation', async () => {
      const user = ctx.users[0]; // Use the user that has the token
      if (!user) return;

      process.env.WRAPPED_YEAR = '2023';

      const res = await request(ctx.app)
        .post(`/users/${user.id}/wrapped`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
    });

    it('should validate authorization policy (own)', async () => {
      const user = ctx.users[0]; // Use the user that has the token
      if (!user) return;

      // Reload user without relations to avoid circular references
      const freshUser = await User.findOne({ where: { id: user.id } });
      if (!freshUser) return;

      const userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(freshUser, ctx.roles), '1');
      process.env.WRAPPED_YEAR = '2023';

      const res = await request(ctx.app)
        .post(`/users/${user.id}/wrapped`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(200);
    });

    it('should return 403 when user cannot update wrapped (all)', async () => {
      const user = ctx.users[0]; // Use a regular user
      const otherUser = ctx.users.find((u) => u.id !== user.id && u.extensiveDataProcessing && u.active && !u.deleted);
      if (!user || !otherUser) return;

      // Reload user without relations to avoid circular references
      const freshUser = await User.findOne({ where: { id: user.id } });
      if (!freshUser) return;

      const userToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(freshUser, ctx.roles), '1');
      process.env.WRAPPED_YEAR = '2023';

      const res = await request(ctx.app)
        .post(`/users/${otherUser.id}/wrapped`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(403);
    });

    it('should handle invalid userId parameter', async () => {
      const res = await request(ctx.app)
        .post('/users/invalid/wrapped')
        .set('Authorization', `Bearer ${ctx.userToken}`);

      // Should return 404 or 400 depending on route matching
      expect([400, 404, 405]).to.include(res.status);
    });
  });

  describe('GET /users/:id/settings', () => {
    it('should return HTTP 200 and all user settings with defaults', async () => {
      const user = ctx.users[0];
      if (!user) return;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('betaEnabled');
      expect(res.body).to.have.property('dashboardTheme');
      if ('language' in res.body) {
        expect(res.body.language).to.be.undefined;
      }
      expect(res.body.betaEnabled).to.equal(false);
      expect(res.body.dashboardTheme).to.be.null;
    });

    it('should return HTTP 200 with updated settings', async () => {
      const user = ctx.users[0];
      if (!user) return;

      // First update settings
      await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ betaEnabled: true, language: 'nl-NL' });

      // Then get them
      const res = await request(ctx.app)
        .get(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.betaEnabled).to.equal(true);
      expect(res.body.language).to.equal('nl-NL');
    });

    it('should return HTTP 404 if user does not exist', async () => {
      const nonExistentId = 99999;
      const res = await request(ctx.app)
        .get(`/users/${nonExistentId}/settings`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('User not found.');
    });

    it('should return HTTP 403 if user tries to access another user\'s settings', async () => {
      const otherUser = ctx.users[1];
      if (!otherUser) return;

      const res = await request(ctx.app)
        .get(`/users/${otherUser.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(403);
    });

    it('should return HTTP 200 if admin accesses any user\'s settings', async () => {
      const user = ctx.users[0];
      if (!user) return;

      const res = await request(ctx.app)
        .get(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('betaEnabled');
      expect(res.body).to.have.property('dashboardTheme');
      expect(res.body).to.have.property('language');
    });
  });

  describe('PATCH /users/:id/settings', () => {
    it('should return HTTP 200 and update a single setting', async () => {
      const user = ctx.users[0];
      if (!user) return;

      const res = await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ betaEnabled: true });

      expect(res.status).to.equal(200);
      expect(res.body.betaEnabled).to.equal(true);
      expect(res.body.dashboardTheme).to.be.null;
    });

    it('should return HTTP 200 and update multiple settings', async () => {
      const user = ctx.users[0];
      if (!user) return;

      const res = await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({
          betaEnabled: true,
          language: 'nl-NL',
          dashboardTheme: { organId: 1, organName: 'Test Organ' },
        });

      expect(res.status).to.equal(200);
      expect(res.body.betaEnabled).to.equal(true);
      expect(res.body.language).to.equal('nl-NL');
      expect(res.body.dashboardTheme).to.deep.equal({ organId: 1, organName: 'Test Organ' });
    });

    it('should return HTTP 200 and persist settings', async () => {
      const user = ctx.users[0];
      if (!user) return;

      // Update settings
      await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ betaEnabled: true, language: 'en-US' });

      // Get settings to verify persistence
      const res = await request(ctx.app)
        .get(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.betaEnabled).to.equal(true);
      expect(res.body.language).to.equal('en-US');
    });

    it('should return HTTP 200 and handle partial updates', async () => {
      const user = ctx.users[0];
      if (!user) return;

      // Set initial values
      await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ betaEnabled: true, language: 'nl-NL' });

      // Update only one setting
      const res = await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ language: 'pl-PL' });

      expect(res.status).to.equal(200);
      expect(res.body.betaEnabled).to.equal(true); // Should remain unchanged
      expect(res.body.language).to.equal('pl-PL'); // Should be updated
    });

    it('should return HTTP 200 and handle null dashboardTheme', async () => {
      const user = ctx.users[0];
      if (!user) return;

      // Set dashboardTheme first
      await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ dashboardTheme: { organId: 1, organName: 'Test' } });

      // Then set it to null
      const res = await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ dashboardTheme: null });

      expect(res.status).to.equal(200);
      expect(res.body.dashboardTheme).to.be.null;
    });

    it('should return HTTP 404 if user does not exist', async () => {
      const nonExistentId = 99999;
      const res = await request(ctx.app)
        .patch(`/users/${nonExistentId}/settings`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ betaEnabled: true });

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('User not found.');
    });

    it('should return HTTP 403 if user tries to update another user\'s settings', async () => {
      const otherUser = ctx.users[1];
      if (!otherUser) return;

      const res = await request(ctx.app)
        .patch(`/users/${otherUser.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ betaEnabled: true });

      expect(res.status).to.equal(403);
    });

    it('should return HTTP 200 if admin updates any user\'s settings', async () => {
      const user = ctx.users[0];
      if (!user) return;

      const res = await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ betaEnabled: true, language: 'en-US' });

      expect(res.status).to.equal(200);
      expect(res.body.betaEnabled).to.equal(true);
      expect(res.body.language).to.equal('en-US');
    });

    it('should validate request body against specification', async () => {
      const user = ctx.users[0];
      if (!user) return;

      const res = await request(ctx.app)
        .patch(`/users/${user.id}/settings`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ invalidField: 'value' });

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('valid');
      expect(res.body.valid).to.equal(false);
    });
  });
});
