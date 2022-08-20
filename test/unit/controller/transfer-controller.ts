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

import { expect, request } from 'chai';
import dinero from 'dinero.js';
import express, { Application, json } from 'express';
import { Connection } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import TokenHandler from '../../../src/authentication/token-handler';
import TransferRequest from '../../../src/controller/request/transfer-request';
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import TransferController from '../../../src/controller/transfer-controller';
import Database from '../../../src/database/database';
import Transfer from '../../../src/entity/transactions/transfer';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { seedTransfers, seedUsers } from '../../seed';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';

describe('TransferController', async (): Promise<void> => {
  let connection: Connection;
  let app: Application;

  let adminAccountDeposit: Transfer;
  let localAccountDeposit: Transfer;
  let adminAccountWithdraw: Transfer;
  let localAccountWithdraw: Transfer;

  let specification: SwaggerSpecification;
  let adminToken: String;
  let token: String;
  let organMemberToken: String;
  let validRequest: TransferRequest;
  let invalidRequest: TransferRequest;

  before(async () => {
    // initialize test database
    connection = await Database.initialize();

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
    await seedTransfers(users);

    adminAccountDeposit = await Transfer.findOne({ where: { to: { id: adminUser.id } } });
    localAccountDeposit = await Transfer.findOne({ where: { to: { id: localUser.id } } });
    adminAccountWithdraw = await Transfer.findOne({ where: { from: { id: adminUser.id } } });
    localAccountWithdraw = await Transfer.findOne({ where: { from: { id: localUser.id } } });

    // create valid and invaled request
    validRequest = {
      amount: {
        amount: 10,
        precision: dinero.defaultPrecision,
        currency: dinero.defaultCurrency,
      },
      description: 'cool',
      fromId: 1,
      toId: null,
    };

    invalidRequest = {
      amount: {
        amount: 10,
        precision: dinero.defaultPrecision,
        currency: dinero.defaultCurrency,
      },
      description: 'cool',
      fromId: null,
      toId: null,
    };

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['User', 'Admin'], lesser: false }, 'nonce admin');
    token = await tokenHandler.signToken({ user: localUser, roles: ['User'], lesser: false }, 'nonce');
    organMemberToken = await tokenHandler.signToken({
      user: localUser, roles: ['User', 'Seller'], organs: [adminUser], lesser: false,
    }, '1');

    // start app
    app = express();
    specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const organRole = { organ: new Set<string>(['*']) };

    // Create roleManager and set roles of Admin and User
    // In this case Admin can do anything and User nothing.
    // This does not reflect the actual roles of the users in the final product.
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Transfer: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });
    roleManager.registerRole({
      name: 'User',
      permissions: {
        Transfer: {
          get: own,
        },
      },
      assignmentCheck: async () => true,
    });
    roleManager.registerRole({
      name: 'Seller',
      permissions: {
        Transfer: {
          create: organRole,
          get: organRole,
          update: organRole,
          delete: organRole,
        },
      },
      assignmentCheck: async () => true,
    });

    const controller = new TransferController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/transfers', controller.getRouter());
  });

  after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  describe('GET /transfers', () => {
    it('should return correct model', async () => {
      const res = await request(app)
        .get('/transfers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).to.equal(200);
      expect(specification.validateModel(
        'Array<TransferResponse>',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(app)
        .get('/transfers')
        .query({ take, skip })
        .set('Authorization', `Bearer ${adminToken}`);

      // number of banners returned is number of banners in database
      const transfers = res.body.records as TransferResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const TransferCount = await Transfer.count();
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(TransferCount);
      expect(transfers.length).to.be.at.most(take);
    });
    it('should return an HTTP 200 and all existing transfers in the database if admin', async () => {
      const res = await request(app)
        .get('/transfers/')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).to.equal(200);

      const TransferCount = await Transfer.count();
      expect((res.body.records as TransferResponse[]).length)
        .to.equal(Math.min(TransferCount, defaultPagination()));
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(app)
        .get('/transfers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /transfers/:id', () => {
    it('should return correct model', async () => {
      const res = await request(app)
        .get(`/transfers/${localAccountWithdraw.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).to.equal(200);
      const validation = specification.validateModel(
        'TransferResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 200 and the withdraw transfer with given id if admin', async () => {
      const res = await request(app)
        .get(`/transfers/${localAccountWithdraw.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect((res.body as TransferResponse).id).to.equal(localAccountWithdraw.id);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 200 and the transfer with the given id if connected via organ', async () => {
      const transfer = await Transfer.findOne({ where: { to: { id: 1 } } });
      expect(transfer).to.not.be.undefined;
      const res = await request(app)
        .get(`/transfers/${transfer.id}`)
        .set('Authorization', `Bearer ${organMemberToken}`);
      expect(res.status).to.equal(200);
      expect((res.body as TransferResponse).id).to.equal(transfer.id);
    });
    it('should return an HTTP 403 if not involved in withdraw transaction not admin', async () => {
      const res = await request(app)
        .get(`/transfers/${adminAccountWithdraw.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 200 and the deposit transfer with given id if admin', async () => {
      const res = await request(app)
        .get(`/transfers/${localAccountDeposit.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect((res.body as TransferResponse).id).to.equal(localAccountDeposit.id);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not involved in deposit transaction not admin', async () => {
      const res = await request(app)
        .get(`/transfers/${adminAccountDeposit.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if the transfer with the given id does not exist for admin', async () => {
      const transferCount = await Transfer.count();
      const res = await request(app)
        .get(`/transfers/${transferCount + 1}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(await Transfer.findOne({ where: { id: transferCount + 1 } })).to.be.null;
      expect(res.body).to.equal('Transfer not found.');
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if the transfer with the given id does not exist and user is not admin', async () => {
      const transferCount = await Transfer.count();
      const res = await request(app)
        .get(`/transfers/${transferCount + 1}`)
        .set('Authorization', `Bearer ${token}`);

      expect(await Transfer.findOne({ where: { id: transferCount + 1 } })).to.be.null;
      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
  });

  describe('POST /transfers', () => {
    it('should store the given transfer in the database and return an HTTP 200 and the product if admin', async () => {
      const transferCount = await Transfer.count();
      const res = await request(app)
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validRequest);

      expect(res.status).to.equal(200);
      const validation = specification.validateModel(
        'TransferResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
      expect(await Transfer.count()).to.equal(transferCount + 1);
      const databaseEntry = await Transfer.findOne({
        where: { id: (res.body as TransferResponse).id },
      });
      expect(databaseEntry).to.exist;
    });
    it('should return an HTTP 400 if the given transfer is invalid', async () => {
      const transferCount = await Transfer.count();
      const res = await request(app)
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidRequest);

      expect(await Transfer.count()).to.equal(transferCount);
      expect(res.body).to.equal('Invalid transfer.');
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const transferCount = await Transfer.count();
      const res = await request(app)
        .post('/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send(validRequest);

      expect(await Transfer.count()).to.equal(transferCount);
      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
  });
});
