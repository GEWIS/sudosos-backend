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
import { request, expect } from 'chai';
import PointOfSaleController from '../../../src/controller/point-of-sale-controller';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import {
  seedAllContainers, seedAllPointsOfSale, seedAllProducts, seedProductCategories,
} from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import { PointOfSaleResponse } from '../../../src/controller/response/point-of-sale-response';

describe('PointOfSaleController', async () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: PointOfSaleController,
    adminUser: User,
    localUser: User,
    adminToken: string,
    token: string,
  };

  before(async () => {
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

    await User.save(adminUser);
    await User.save(localUser);

    const categories = await seedProductCategories();
    const {
      products,
      productRevisions,
    } = await seedAllProducts([adminUser, localUser], categories);
    const {
      containers,
      containerRevisions,
    } = await seedAllContainers([adminUser, localUser], productRevisions, products);
    await seedAllPointsOfSale([adminUser, localUser], containerRevisions, containers);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: ['User'] }, 'nonce');

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        PointOfSale: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
        Container: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    roleManager.registerRole({
      name: 'User',
      permissions: {
        Container: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });

    const controller = new PointOfSaleController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/pointsofsale', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /pointsofsale', () => {
    it('should return an HTTP 200 and all existing points of sale if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const activePointOfSaleCount = await PointOfSale.count({ where: 'currentRevision' });
      expect((res.body as PointOfSaleResponse[]).length).to.equal(activePointOfSaleCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('GET /pointsofsale/:id', () => {
    it('should return an HTTP 200 and the point of sale with given id if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((res.body as PointOfSaleResponse).id).to.equal(1);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the point of sale with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count()) + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of Sale not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('GET /pointsofsale/:id/containers', async () => {
    it('should return an HTTP 200 and the containers in the given point of sale if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the containers in the given point of sale if normal user', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/containers')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and an empty list if point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count()) + 1}/containers`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.equal(0);
    });
  });

  describe('GET /pointsofsale/:id/products', async () => {
    it('should return an HTTP 200 and the products in the given point of sale if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the products in the given point of sale if normal user', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/products')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and an empty list if point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count()) + 1}/products`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.equal(0);
    });
  });
});
