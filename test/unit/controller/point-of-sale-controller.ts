/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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

import { Connection, IsNull, Not } from 'typeorm';
import { json } from 'body-parser';
import chai, { expect, request } from 'chai';
import PointOfSaleController from '../../../src/controller/point-of-sale-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import {
  seedContainers, seedPointsOfSale,
  seedProductCategories, seedProducts,
  seedVatGroups,
} from '../../seed';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import {
  PointOfSaleResponse,
  PointOfSaleWithContainersResponse,
} from '../../../src/controller/response/point-of-sale-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { ContainerResponse, ContainerWithProductsResponse } from '../../../src/controller/response/container-response';
import { ProductResponse } from '../../../src/controller/response/product-response';
import {
  CreatePointOfSaleParams,
  CreatePointOfSaleRequest,
  UpdatePointOfSaleRequest,
} from '../../../src/controller/request/point-of-sale-request';
import { INVALID_CONTAINER_ID } from '../../../src/controller/request/validators/validation-errors';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { finishTestDB } from '../../helpers/test-helpers';
import { ORGAN_USER, UserFactory } from '../../helpers/user-factory';
import { UpdateContainerRequest } from '../../../src/controller/request/container-request';
import ContainerController from '../../../src/controller/container-controller';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Container from '../../../src/entity/container/container';
import express, { Express } from 'express';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import Database from '../../../src/database/database';
import TokenHandler from '../../../src/authentication/token-handler';
import { SwaggerSpecification } from 'swagger-model-validator';
import { getToken, seedRoles } from '../../seed/rbac';

chai.use(deepEqualInAnyOrder);

/**
 * Tests if a POS response is equal to the request.
 * @param source - The source from which the POS was created.
 * @param response - The received POS.
 * @return true if the source and response describe the same POS.
 */
function pointOfSaleEq(source: CreatePointOfSaleRequest, response: PointOfSaleResponse) {
  expect(source.name).to.eq(response.name);
  expect(source.ownerId).to.eq(response.owner.id);
  expect(source.useAuthentication).to.eq(response.useAuthentication);
}

function updatePointOfSaleEq(source: UpdatePointOfSaleRequest, response: PointOfSaleWithContainersResponse) {
  expect(source.name).to.eq(response.name);
  expect(source.useAuthentication).to.eq(response.useAuthentication);
  expect(source.containers).to.deep.equalInAnyOrder(response.containers.map((c) => c.id));
}

describe('PointOfSaleController', async () => {
  let ctx: {
    connection: Connection,
    app: Express,
    specification: SwaggerSpecification,
    roleManager: RoleManager,
    tokenHandler: TokenHandler,
    controller: PointOfSaleController,
    adminUser: User,
    localUser: User,
    organUser: User,
    containers: Container[],
    deletedContainers: Container[],
    pointsOfSale: PointOfSale[],
    deletedPointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    validPOSRequest: CreatePointOfSaleRequest,
    adminToken: string,
    userToken: string,
    organMemberToken: string,
  };

  before(async () => {
    const connection = await Database.initialize();
    const app = express();
    const specification = await Swagger.initialize(app);
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    // create dummy users
    const adminUser = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);

    const localUser = await User.save({
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);
    const organUser = await (await UserFactory(await ORGAN_USER())).get();

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts([adminUser, organUser], categories, vatGroups);
    const { containers, containerRevisions } = await seedContainers([adminUser, organUser], productRevisions);
    const { pointsOfSale, pointOfSaleRevisions } = await seedPointsOfSale([adminUser, organUser], containerRevisions);

    const validPOSRequest: CreatePointOfSaleRequest = {
      containers: containers.filter((c) => c.deletedAt == null).slice(0, 3).map((c) => c.id),
      name: 'Valid POS',
      useAuthentication: true,
      ownerId: 2,
    };
    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const organ = { organ: new Set<string>(['*']) };
    const roles = await seedRoles([{
      name: 'SUPER_ADMIN',
      permissions: {
        PointOfSale: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
        Transaction: {
          get: all,
        },
        Container: {
          get: all,
          update: all,
        },
        Product: {
          get: all,
        },
      },
      assignmentCheck: async (u: User) => u.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        PointOfSale: {
          create: organ,
          get: { ...organ, ...own },
          update: { ...organ, ...own },
          delete: { ...organ, ...own },
        },
        Transaction: {
          get: { ...organ, ...own },
        },
        Container: {
          get: { ...organ, ...own },
        },
        Product: {
          get: { ...organ, ...own },
        },
      },
      assignmentCheck: async () => true,
    }]);
    const roleManager = await new RoleManager().initialize();

    const adminToken = await tokenHandler.signToken(await getToken(adminUser, roles), 'nonce');
    const userToken = await tokenHandler.signToken(await getToken(localUser, roles), 'nonce');
    const organMemberToken = await tokenHandler.signToken(await getToken(localUser, roles, [organUser]), '1');

    const controller = new PointOfSaleController({ specification: specification, roleManager });
    const containerController = new ContainerController({ specification: specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/pointsofsale', controller.getRouter());
    app.use('/containers', containerController.getRouter());

    ctx = {
      connection,
      app,
      roleManager,
      controller,
      specification,
      tokenHandler,
      containers: containers.filter((c) => c.deletedAt == null),
      deletedContainers: containers.filter((c) => c.deletedAt != null),
      pointsOfSale: pointsOfSale.filter((p) => p.deletedAt == null),
      deletedPointsOfSale: pointsOfSale.filter((p) => p.deletedAt != null),
      pointOfSaleRevisions,
      validPOSRequest,
      adminToken,
      userToken,
      adminUser,
      localUser,
      organUser,
      organMemberToken,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
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

      const activePointOfSaleCount = await PointOfSale.count({
        where:
          { currentRevision: Not(IsNull()) },
      });
      expect(pointsOfSale.length).to.equal(Math.min(activePointOfSaleCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activePointOfSaleCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`);

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

      const activePointOfSaleCount = await PointOfSale.count({
        where: { currentRevision: Not(IsNull()) },
      });
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
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organUser.id } } });
      expect(pos).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);
      expect(res.status).to.equal(200);
      expect((res.body as PointOfSaleResponse).id).to.equal(pos.id);
    });
    it('should return an HTTP 403 if not admin and not connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organUser.id } } });
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if the point of sale is soft deleted', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${ctx.deletedPointsOfSale[0].id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of Sale not found.');
    });
    it('should return an HTTP 404 if the point of sale with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count({ withDeleted: true })) + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of Sale not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });
  describe('GET /pointsofsale/:id/transactions', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedTransactionResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the transactions if admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/transactions')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(ctx.specification.validateModel(
        'PaginatedTransactionResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 200 and the transactions if connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organUser.id } } });
      expect(pos).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'PaginatedTransactionResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 403 if not admin and not connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organUser.id } } });
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.organUser}`);
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if the point of sale with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count({ withDeleted: true })) + 1}/transactions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of Sale not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/transactions')
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
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

      // Never include deleted containers
      const deletedContainerIds = ctx.deletedContainers.map((c) => c.id);
      containers.forEach((container) => expect(deletedContainerIds).to.not.include(container.id));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the containers in the given point of sale if normal user', async () => {
      const pos = ctx.pointOfSaleRevisions.find((p) => p.pointOfSale.owner.id === ctx.organUser.id
        && p.revision === p.pointOfSale.currentRevision && p.containers.length > 0);
      expect(pos).to.not.be.undefined;
      const id = pos.pointOfSaleId;

      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/containers`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);

      const containers = res.body.records as ContainerResponse[];

      expect(res.status).to.equal(200);
      expect(containers.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and an empty list if point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count({ withDeleted: true })) + 1}/containers`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const containers = res.body.records as ContainerResponse[];

      expect(res.status).to.equal(200);
      expect(containers.length).to.equal(0);
    });
  });
  describe('GET /pointsofsale/:id/products', async () => {
    it('should return correct model', async () => {
      const pos = await PointOfSale.findOne({ relations: ['owner'], where: { owner: { id: ctx.adminUser.id } } });
      expect(pos).to.not.be.null;
      const { id } = pos;

      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/products`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      res.body.forEach((p: ProductResponse) => {
        const validation = ctx.specification.validateModel(
          'ProductResponse',
          p,
          false,
          true,
        );
        expect(validation.valid).to.be.true;
      });
    });
    it('should return an HTTP 200 and the products in the given point of sale if admin', async () => {
      const take = 5;
      const skip = 1;
      const res = await request(ctx.app)
        .get('/pointsofsale/1/products')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const products = res.body as ProductResponse[];

      expect(res.status).to.equal(200);
      expect(products.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the products in the given point of sale if owner', async () => {
      const pos = ctx.pointOfSaleRevisions.find((p) => p.pointOfSale.owner.id === ctx.organUser.id
        && p.revision === p.pointOfSale.currentRevision && p.containers.length > 0 && p.containers.some((c) => c.products.length > 0));
      expect(pos).to.not.be.null;
      const id = pos.pointOfSaleId;

      const res = await request(ctx.app)
        .get(`/pointsofsale/${id}/products`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);

      const products = res.body as ProductResponse[];

      expect(res.status).to.equal(200);
      expect(products.length).to.be.at.least(1);
    });
    it('should return an HTTP 200 and an empty list if point of sale does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count({ withDeleted: true })) + 1}/products`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect((res.body as ProductResponse[]).length).to.equal(0);
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
    it('should verify containers exist', async () => {
      const containerId = ctx.containers.length + ctx.deletedContainers.length + 10;
      const invalidRequest = {
        ...ctx.validPOSRequest,
        containers: [containerId],
      };
      await expectError(invalidRequest, `Containers: ${INVALID_CONTAINER_ID(containerId).value}`);
    });
    it('should verify containers are not soft deleted', async () => {
      const containerId = ctx.deletedContainers[0].id;
      const invalidRequest = {
        ...ctx.validPOSRequest,
        containers: [containerId],
      };
      await expectError(invalidRequest, `Containers: ${INVALID_CONTAINER_ID(containerId).value}`);
    });
  }
  describe('POST /pointsofsale', () => {
    describe('verifyPointOfSaleRequest Specification', async (): Promise<void> => {
      testValidationOnRoute('post', '/pointsofsale');
    });
    it('should store the given POS and return an HTTP 200 if admin', async () => {
      const count = await PointOfSale.count();
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validPOSRequest);

      expect(res.status).to.equal(200);
      expect(res.body).to.not.be.empty;

      const validation = ctx.specification.validateModel(
        'PointOfSaleWithContainersResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      expect(await PointOfSale.count()).to.equal(count + 1);
      const body = res.body as PointOfSaleWithContainersResponse;
      pointOfSaleEq(ctx.validPOSRequest, body);
      const databaseProduct = await PointOfSale.findOne({
        where: { id: body.id, currentRevision: body.revision },
      });
      expect(databaseProduct).to.exist;

      expect(res.status).to.equal(200);
    });
    it('should store the given POS and return an HTTP 200 if connected via organ', async () => {
      const count = await PointOfSale.count();
      const createPointOfSaleParams: CreatePointOfSaleParams = {
        ...ctx.validPOSRequest,
        ownerId: ctx.organUser.id,
      };
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send(createPointOfSaleParams);

      const validation = ctx.specification.validateModel(
        'PointOfSaleWithContainersResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      expect(await PointOfSale.count()).to.equal(count + 1);
      const body = res.body as PointOfSaleWithContainersResponse;
      pointOfSaleEq(createPointOfSaleParams, body);
      const databasePointOfSale = await PointOfSale.findOne({
        where: { id: body.id, currentRevision: body.revision },
      });
      expect(databasePointOfSale).to.exist;

      expect(res.status).to.equal(200);

      // Cleanup
      await PointOfSaleRevision.delete({ pointOfSaleId: databasePointOfSale.id });
      await PointOfSale.delete({ id: databasePointOfSale.id });
    });
    it('should return an HTTP 403 if not admin', async () => {
      const count = await PointOfSale.count();
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validPOSRequest);

      expect(await PointOfSale.count()).to.equal(count);
      expect(res.body).to.be.empty;

      expect(res.status).to.equal(403);
    });
  });
  describe('PATCH /pointsofsale/{id}', () => {
    describe('verifyPointOfSaleRequest Specification', async (): Promise<void> => {
      testValidationOnRoute('post', '/pointsofsale');
    });
    it('should patch the use authentication', async () => {
      const { id } = ctx.pointsOfSale[0];
      let res = await request(ctx.app)
        .get(`/pointsofsale/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const pos = res.body as PointOfSaleWithContainersResponse;
      const req: UpdatePointOfSaleRequest = {
        containers: pos.containers.map((c) => c.id),
        name: pos.name,
        useAuthentication: !pos.useAuthentication,
        id: 1,
      };
      res = await request(ctx.app)
        .patch(`/pointsofsale/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.eq(200);
      updatePointOfSaleEq(req, res.body as PointOfSaleWithContainersResponse);
    });
    it('should patch the containers', async () => {
      const { id } = ctx.pointsOfSale[0];
      let res = await request(ctx.app)
        .get(`/pointsofsale/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const pos = res.body as PointOfSaleWithContainersResponse;
      const req: UpdatePointOfSaleRequest = {
        containers: [ctx.validPOSRequest.containers[0]],
        name: pos.name,
        useAuthentication: pos.useAuthentication,
        id: 1,
      };
      res = await request(ctx.app)
        .patch(`/pointsofsale/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.eq(200);
      updatePointOfSaleEq(req, res.body as PointOfSaleWithContainersResponse);
    });
    it('should patch the name', async () => {
      const { id } = ctx.pointsOfSale[0];
      let res = await request(ctx.app)
        .get(`/pointsofsale/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const pos = res.body as PointOfSaleWithContainersResponse;
      const req: UpdatePointOfSaleRequest = {
        containers: pos.containers.map((c) => c.id),
        name: 'New name',
        useAuthentication: pos.useAuthentication,
        id: 1,
      };
      res = await request(ctx.app)
        .patch(`/pointsofsale/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.eq(200);
      updatePointOfSaleEq(req, res.body as PointOfSaleWithContainersResponse);
    });
  });
  describe('Propagating updates', () => {
    it('should propagate updates', async () => {
      let res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validPOSRequest);
      const posid = res.body.id;
      res = await request(ctx.app)
        .get(`/pointsofsale/${posid}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const oldPos = res.body as PointOfSaleWithContainersResponse;
      const containerIds = (res.body.containers as ContainerWithProductsResponse[]).map((c) => c.id);
      const container = res.body.containers[0] as ContainerWithProductsResponse;
      const containerId = container.id;

      const containerUpdate: UpdateContainerRequest = {
        name: 'Cool new container',
        products: [container.products[0].id],
        public: container.public,
      };


      const pointOfSaleUpdate: UpdatePointOfSaleRequest = {
        containers: containerIds,
        id: oldPos.id,
        name: oldPos.name,
        useAuthentication: oldPos.useAuthentication,
      };

      res = await request(ctx.app)
        .patch(`/pointsofsale/${posid}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(pointOfSaleUpdate);
      expect(res.status).to.equal(200);

      const newPos = res.body as PointOfSaleWithContainersResponse;
      expect(newPos.revision).to.equal(oldPos.revision + 1);


      res = await request(ctx.app)
        .patch(`/containers/${containerId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(containerUpdate);
      expect(res.status).to.equal(200);


      res = await request(ctx.app)
        .get(`/pointsofsale/${posid}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const newerPos = res.body as PointOfSaleWithContainersResponse;
      const newContainer = newerPos.containers.find((c) => c.id === containerId);

      expect(newContainer.name).to.eq(containerUpdate.name);
      expect(newContainer.products.map((p) => p.id)).to.deep.equalInAnyOrder(containerUpdate.products);
    });
  });
  describe('DELETE /pointsofsale/:id', () => {
    it('should return 204 if owner', async () => {
      const pointOfSale = ctx.pointsOfSale.find((p) => p.owner.id === ctx.organUser.id && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/pointsofsale/${pointOfSale.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send();

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSale.id }, withDeleted: true });
      expect(dbPointOfSale).to.not.be.null;
      expect(dbPointOfSale.deletedAt).to.not.be.null;

      // Cleanup
      await dbPointOfSale.recover();
    });
    it('should return 204 for any point of sale if admin', async () => {
      const pointOfSale = ctx.pointsOfSale.find((p) => p.owner.id !== ctx.adminUser.id && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/pointsofsale/${pointOfSale.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSale.id }, withDeleted: true });
      expect(dbPointOfSale).to.not.be.null;
      expect(dbPointOfSale.deletedAt).to.not.be.null;

      // Cleanup
      await dbPointOfSale.recover();
    });
    it('should return 403 if not owner', async () => {
      const pointOfSale = ctx.pointsOfSale.find((p) => p.owner.id !== ctx.organUser.id && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/pointsofsale/${pointOfSale.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send();

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should return 404 if point of sale does not exist', async () => {
      const pointOfSaleId = ctx.pointsOfSale.length + ctx.deletedPointsOfSale.length + 2;

      const res = await request(ctx.app)
        .delete(`/pointsofsale/${pointOfSaleId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of sale not found');
    });
    it('should return 404 if point of sale is soft deleted', async () => {
      const pointOfSaleId = ctx.deletedPointsOfSale[0].id;

      const res = await request(ctx.app)
        .delete(`/pointsofsale/${pointOfSaleId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of sale not found');
    });
  });
});
