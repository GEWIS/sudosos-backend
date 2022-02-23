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
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { ContainerResponse } from '../../../src/controller/response/container-response';
import { PaginatedProductResponse, ProductResponse } from '../../../src/controller/response/product-response';
import UpdatedPointOfSale from '../../../src/entity/point-of-sale/updated-point-of-sale';
import { CreatePointOfSaleRequest } from '../../../src/controller/request/point-of-sale-request';
import { UpdateContainerParams } from '../../../src/controller/request/container-request';
import { UpdateProductParams } from '../../../src/controller/request/product-request';

/**
 * Tests if a POS response is equal to the request.
 * @param source - The source from which the POS was created.
 * @param response - The received POS.
 * @return true if the source and response describe the same POS.
 */
function pointOfSaleEq(source: CreatePointOfSaleRequest, response: PointOfSaleResponse) {
  expect(source.name).to.eq(response.name);
  expect(source.endDate).to.eq(response.endDate);
  expect(source.startDate).to.eq(response.startDate);
  expect(source.useAuthentication).to.eq(response.useAuthentication);
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
    validPOSRequest: CreatePointOfSaleRequest,
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
      type: UserType.MEMBER,
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

    const validPOSRequest: CreatePointOfSaleRequest = {
      containers: [containers[0].id, containers[1].id, containers[2].id],
      endDate: '2100-01-01T21:00:00.000Z',
      name: 'Valid POS',
      startDate: '2100-01-01T17:00:00.000Z',
      useAuthentication: false,
      ownerId: 2,
    };

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: ['User'] }, 'nonce');

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
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
          create: own,
          get: own,
          update: own,
          delete: own,
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
      validPOSRequest,
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
  describe('GET /pointsofsale/:id/update', async () => {
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
    it('should verify endDate after startDate', async () => {
      const req: CreatePointOfSaleRequest = {
        ...ctx.validPOSRequest,
        endDate: ctx.validPOSRequest.startDate,
      };
      await expectError(req, 'End Date must be after the Start Date.');
    });
    it('should verify endDate', async () => {
      const req: CreatePointOfSaleRequest = { ...ctx.validPOSRequest, endDate: '' };
      await expectError(req, 'endDate: is not a valid Date.');
    });
    it('should verify startDate', async () => {
      const req: CreatePointOfSaleRequest = { ...ctx.validPOSRequest, startDate: '' };
      await expectError(req, 'startDate: is not a valid Date.');
    });
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
        containers: [-1, -69],
      };
      await expectError(invalidRequest, 'Not all container IDs are valid.');
    });
    it('should verify Container Updates', async () => {
      const withContainerUpdate: CreatePointOfSaleRequest = JSON.parse(
        JSON.stringify(ctx.validPOSRequest),
      );

      const failID = withContainerUpdate.containers.pop() as number;
      const containerRequest: UpdateContainerParams = {
        id: failID,
        name: '',
        products: [1],
        public: true,
        ownerId: undefined,
      };

      withContainerUpdate.containers.push(containerRequest);
      await expectError(withContainerUpdate, 'Container validation failed: Name: must be a non-zero length string.');
    });
    it('should verify ContainerUpdate with productUpdate', async () => {
      const withContainerUpdate: CreatePointOfSaleRequest = JSON.parse(
        JSON.stringify(ctx.validPOSRequest),
      );
      const failID = withContainerUpdate.containers.pop() as number;
      const updateProductParams: UpdateProductParams = {
        alcoholPercentage: 0,
        category: 1,
        id: 0,
        ownerId: undefined,
        name: 'ProductRequestID',
        price: {
          amount: -100,
          currency: 'EUR',
          precision: 2,
        },
      };

      const containerRequest: UpdateContainerParams = {
        id: failID,
        ownerId: undefined,
        name: 'Container',
        products: [updateProductParams],
        public: true,
      };

      withContainerUpdate.containers.push(containerRequest);
      await expectError(withContainerUpdate, 'Container validation failed: Product validation failed: Price must be greater than zero');
    });
    it('should verify ContainerUpdate with productUpdate ', async () => {
      const withContainerUpdate: CreatePointOfSaleRequest = JSON.parse(
        JSON.stringify(ctx.validPOSRequest),
      );
      const failID = withContainerUpdate.containers.pop() as number;
      const updateProductParams: UpdateProductParams = {
        alcoholPercentage: 0,
        category: 1,
        id: 1,
        ownerId: undefined,
        name: '',
        price: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
      };

      const updateContainerParams: UpdateContainerParams = {
        id: failID,
        ownerId: undefined,
        name: 'Container',
        products: [updateProductParams],
        public: true,
      };

      withContainerUpdate.containers.push(updateContainerParams);
      await expectError(withContainerUpdate, 'Container validation failed: Product validation failed: Name: must be a non-zero length string.');
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

      expect(await PointOfSale.count()).to.equal(count + 1);
      pointOfSaleEq(ctx.validPOSRequest, res.body as PointOfSaleResponse);
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
