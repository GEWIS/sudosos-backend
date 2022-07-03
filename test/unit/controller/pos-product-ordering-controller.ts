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
import express, { Application } from 'express';
import log4js, { Logger } from 'log4js';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import { expect, request } from 'chai';
import TokenHandler from '../../../src/authentication/token-handler';
import POSProductOrderingController from '../../../src/controller/pos-product-ordering-controller';
import Database from '../../../src/database/database';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import seedDatabase from '../../seed';
import { POSProductOrderingRequest } from '../../../src/controller/request/pos-product-ordering-request';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';

describe('POSProductOrderingController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: POSProductOrderingController,
    userToken: string,
    adminToken: string,
    users: User[],
    validOrderReq: POSProductOrderingRequest,
    swaggerspec: SwaggerSpecification,
    logger: Logger,
  };

  // eslint-disable-next-line func-names
  before(async () => {
    const logger: Logger = log4js.getLogger('POSProductOrderingControllerTest');
    logger.level = 'ALL';
    const connection = await Database.initialize();
    const app = express();
    const database = await seedDatabase();
    const validOrderReq = {
      pointOfSaleId: 1,
      ordering: [
        2,
        5,
        1,
      ],
    } as POSProductOrderingRequest;
    ctx = {
      logger,
      connection,
      app,
      validOrderReq,
      swaggerspec: undefined,
      specification: undefined,
      controller: undefined,
      userToken: undefined,
      adminToken: undefined,
      ...database,
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.userToken = await tokenHandler.signToken({ user: ctx.users[0], roles: ['User'], lesser: false }, '39');
    ctx.adminToken = await tokenHandler.signToken({ user: ctx.users[6], roles: ['User', 'Admin'], lesser: false }, '39');

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        PointOfSale: {
          get: all,
          create: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.swaggerspec = await Swagger.importSpecification();
    ctx.controller = new POSProductOrderingController({
      specification: ctx.specification,
      roleManager,
    });

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/pointsofsale', ctx.controller.getRouter());
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('POST /pointsofsale/productordering', () => {
    it('should return an HTTP 200 and the saved ordering when user is admin', async () => {
      const res = await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 when user is not admin', async () => {
      const res = await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validOrderReq);
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 400 if the request is invalid', async () => {
      const res = await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ ...ctx.validOrderReq, ordering: ['appels'] });
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /pointsofsale/:id/productordering', () => {
    it('should return an HTTP 200 and the requested ordering if user is admin', async () => {
      // store an ordering
      await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);

      const res = await request(ctx.app)
        .get('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 200 and an empty ordering if point of sale exists but ordering does not exist and user is admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/2/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/0/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('PATCH /pointsofsale/:id/productordering', () => {
    it('should return an HTTP 200 and the updated ordering if the ordering is valid and user is admin', async () => {
      // store an ordering
      await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);

      const res = await request(ctx.app)
        .patch('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if the request is invalid', async () => {
      const res = await request(ctx.app)
        .patch('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ ...ctx.validOrderReq, ordering: ['appels'] });
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the ordering does not exist', async () => {
      const res = await request(ctx.app)
        .patch('/pointsofsale/2/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // store an ordering
      await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);

      const res = await request(ctx.app)
        .patch('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validOrderReq);
      expect(res.status).to.equal(403);
    });
  });

  describe('DELETE /pointsofsale/:id/productordering', () => {
    it('should return an HTTP 200 and the deleted ordering if the ordering exists and user is admin', async () => {
      // store an ordering
      await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);

      const res = await request(ctx.app)
        .delete('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the ordering does not exist', async () => {
      const res = await request(ctx.app)
        .delete('/pointsofsale/2/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 404 if the POS does not exist', async () => {
      const res = await request(ctx.app)
        .delete(`/pointsofsale/${(await PointOfSale.count() + 1)}/productordering`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // store an ordering
      await request(ctx.app)
        .post('/pointsofsale/productordering')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validOrderReq);

      const res = await request(ctx.app)
        .delete('/pointsofsale/1/productordering')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });
});
