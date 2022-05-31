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
  seedAllContainers, seedAllPointsOfSale, seedAllProducts, seedProductCategories, seedVatGroups,
} from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import { PointOfSaleResponse } from '../../../src/controller/response/point-of-sale-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { ContainerResponse } from '../../../src/controller/response/container-response';
import { PaginatedProductResponse, ProductResponse } from '../../../src/controller/response/product-response';
import UpdatedPointOfSale from '../../../src/entity/point-of-sale/updated-point-of-sale';
import { CreatePointOfSaleParams, CreatePointOfSaleRequest } from '../../../src/controller/request/point-of-sale-request';
import { INVALID_CONTAINER_ID } from '../../../src/controller/request/validators/validation-errors';

/**
 * Tests if a POS response is equal to the request.
 * @param source - The source from which the POS was created.
 * @param response - The received POS.
 * @return true if the source and response describe the same POS.
 */
function pointOfSaleEq(source: CreatePointOfSaleRequest, response: PointOfSaleResponse) {
  expect(source.name).to.eq(response.name);
  expect(source.ownerId).to.eq(response.owner.id);
}

describe('PointOfSaleController', async () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: PointOfSaleController,
    adminUser: User,
    localUser: User,
    organ: User,
    validPOSRequest: CreatePointOfSaleRequest,
    adminToken: string,
    token: string,
    organMemberToken: string,
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
      type: UserType.MEMBER,
      active: true,
    } as User;

    const organ = {
      id: 3,
      firstName: 'Organ',
      type: UserType.ORGAN,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    await User.save(organ);

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const {
      products,
      productRevisions,
    } = await seedAllProducts([adminUser, localUser], categories, vatGroups);
    const {
      containers,
      containerRevisions,
    } = await seedAllContainers([adminUser, localUser], productRevisions, products);
    await seedAllPointsOfSale([adminUser, localUser, organ], containerRevisions, containers);

    const validPOSRequest: CreatePointOfSaleRequest = {
      containers: [containers[0].id, containers[1].id, containers[2].id],
      name: 'Valid POS',
      ownerId: 2,
    };

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: ['User'], lesser: false }, 'nonce');
    const organMemberToken = await tokenHandler.signToken({
      user: localUser, roles: ['User', 'Seller'], organs: [organ], lesser: false,
    }, '1');

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const organRole = { organ: new Set<string>(['*']) };

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
          get: own,
        },
        PointOfSale: {
          get: own,
          update: own,
          delete: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });

    roleManager.registerRole({
      name: 'Seller',
      permissions: {
        Container: {
          get: organRole,
        },
        PointOfSale: {
          get: organRole,
          create: organRole,
          update: organRole,
          delete: organRole,
        },
      },
      assignmentCheck: async () => true,
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
      organ,
      validPOSRequest,
      adminToken,
      token,
      organMemberToken,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /pointsofsale', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedPointOfSaleResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing points of sale if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const pointsOfSale = res.body.records as PointOfSaleResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const activePointOfSaleCount = await PointOfSale.count({ where: 'currentRevision' });
      expect(pointsOfSale.length).to.equal(Math.min(activePointOfSaleCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activePointOfSaleCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const containers = res.body.records as ContainerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const activePointOfSaleCount = await PointOfSale.count({ where: 'currentRevision' });
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(activePointOfSaleCount);
      expect(containers.length).to.be.at.most(take);
    });
  });
  describe('GET /pointsofsale/:id', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PointOfSaleWithContainersResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the point of sale with given id if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((res.body as PointOfSaleResponse).id).to.equal(1);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 200 and the point of sale if connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: ctx.organ } });
      expect(pos).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);

      expect((res.body as PointOfSaleResponse).id).to.equal(pos.id);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin and not connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: ctx.organ } });
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.organ}`);
      expect(res.status).to.equal(403);
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
  describe('GET /pointsofsale/:id/update', async () => {
    it('should return correct model', async () => {
      const { id } = (await UpdatedPointOfSale.find({ relations: ['pointOfSale'] }))[0].pointOfSale;
      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/update`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(ctx.specification.validateModel(
        'UpdatedPointOfSaleWithContainersResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the update if admin', async () => {
      const { id } = (await UpdatedPointOfSale.find({ relations: ['pointOfSale'] }))[0].pointOfSale;

      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/update`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.id).to.be.equal(id);
    });
  });
  describe('GET /pointsofsale/:id/containers', async () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedContainerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the containers in the given point of sale if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const containers = res.body.records as ContainerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(res.status).to.equal(200);
      expect(containers.length).to.be.at.least(1);

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the containers in the given point of sale if normal user', async () => {
      const { id } = await PointOfSale.findOne({ relations: ['owner'], where: { owner: ctx.localUser } });

      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/containers`)
        .set('Authorization', `Bearer ${ctx.token}`);

      const containers = res.body.records as ContainerResponse[];

      expect(res.status).to.equal(200);
      expect(containers.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and an empty list if point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count()) + 1}/containers`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const containers = res.body.records as ContainerResponse[];

      expect(res.status).to.equal(200);
      expect(containers.length).to.equal(0);
    });
  });
  describe('GET /pointsofsale/:id/products', async () => {
    it('should return correct model', async () => {
      const { id } = await PointOfSale.findOne({ relations: ['owner'], where: { owner: ctx.localUser } });
      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/products`)
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the products in the given point of sale if admin', async () => {
      const take = 5;
      const skip = 1;
      const res = await request(ctx.app)
        .get('/pointsofsale/1/products')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const products = res.body.records as ProductResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(res.status).to.equal(200);
      expect(products.length).to.be.at.least(1);
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the products in the given point of sale if owner', async () => {
      const { id } = await PointOfSale.findOne({ relations: ['owner'], where: { owner: ctx.localUser } });

      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/products`)
        .set('Authorization', `Bearer ${ctx.token}`);

      const products = res.body.records as ProductResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(res.status).to.equal(200);
      expect(products.length).to.be.at.least(1);
      expect(pagination).to.not.be.undefined;
    });
    it('should return an HTTP 200 and an empty list if point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count()) + 1}/products`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect((res.body as PaginatedProductResponse).records.length).to.equal(0);
    });
  });

  function testValidationOnRoute(type: any, route: string) {
    async function expectError(req: CreatePointOfSaleRequest, error: string) {
      // @ts-ignore
      const res = await ((request(ctx.app)[type])(route)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req));
      expect(res.status).to.eq(400);
      expect(res.body).to.eq(error);
    }
    it('should verify Name', async () => {
      const req: CreatePointOfSaleRequest = { ...ctx.validPOSRequest, name: '' };
      await expectError(req, 'Name: must be a non-zero length string.');
    });
    it('should verify Owner', async () => {
      const req: CreatePointOfSaleRequest = { ...ctx.validPOSRequest, ownerId: -1 };
      await expectError(req, 'ownerId: must exist.');
    });
    it('should verify containers Ids', async () => {
      const invalidRequest = {
        ...ctx.validPOSRequest,
        containers: [-1],
      };
      await expectError(invalidRequest, `Containers: ${INVALID_CONTAINER_ID(-1).value}`);
    });
  }
  describe('POST /pointsofsale', () => {
    describe('verifyPointOfSaleRequest Specification', async (): Promise<void> => {
      await testValidationOnRoute('post', '/pointsofsale');
    });
    it('should store the given POS and return an HTTP 200 if admin', async () => {
      const count = await PointOfSale.count();
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validPOSRequest);
      console.error(res.body);
      expect(ctx.specification.validateModel(
        'UpdatedPointOfSaleResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      expect(await PointOfSale.count()).to.equal(count + 1);
      pointOfSaleEq(ctx.validPOSRequest, res.body as PointOfSaleResponse);
      const databaseProduct = await UpdatedPointOfSale.findOne(
        (res.body as PointOfSaleResponse).id,
      );
      expect(databaseProduct).to.exist;

      expect(res.status).to.equal(200);
    });
    it('should store the given POS and return an HTTP 200 if connected via organ', async () => {
      const count = await PointOfSale.count();
      const createPointOfSaleParams: CreatePointOfSaleParams = {
        ...ctx.validPOSRequest,
        ownerId: ctx.organ.id,
      };
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send(createPointOfSaleParams);
      expect(ctx.specification.validateModel(
        'UpdatedPointOfSaleResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      expect(await PointOfSale.count()).to.equal(count + 1);
      pointOfSaleEq(createPointOfSaleParams, res.body as PointOfSaleResponse);
      const databaseProduct = await UpdatedPointOfSale.findOne(
        (res.body as PointOfSaleResponse).id,
      );
      expect(databaseProduct).to.exist;

      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const count = await PointOfSale.count();
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validPOSRequest);

      expect(await PointOfSale.count()).to.equal(count);
      expect(res.body).to.be.empty;

      expect(res.status).to.equal(403);
    });
  });
});
