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

import { IsNull, Not } from 'typeorm';
import { json } from 'body-parser';
import chai, { expect, request } from 'chai';
import PointOfSaleController from '../../../src/controller/point-of-sale-controller';
import User, { UserType } from '../../../src/entity/user/user';
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
import { PaginatedProductResponse, ProductResponse } from '../../../src/controller/response/product-response';
import {
  CreatePointOfSaleParams,
  CreatePointOfSaleRequest,
  UpdatePointOfSaleRequest,
} from '../../../src/controller/request/point-of-sale-request';
import { INVALID_CONTAINER_ID } from '../../../src/controller/request/validators/validation-errors';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { defaultContext, DefaultContext, defaultTokens, finishTestDB } from '../../helpers/test-helpers';
import { ORGAN_USER, UserFactory } from '../../helpers/user-factory';
import { allDefinition, organDefinition, ownDefintion, RoleFactory } from '../../helpers/role-factory';
import { UpdateContainerRequest } from '../../../src/controller/request/container-request';
import ContainerController from '../../../src/controller/container-controller';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';

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
  let ctx: DefaultContext & {
    controller: PointOfSaleController,
    admin: User,
    user: User,
    organ: User,
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    validPOSRequest: CreatePointOfSaleRequest,
    adminToken: string,
    superAdminToken: string,
    token: string,
    organMemberToken: string,
  };

  before(async () => {
    ctx = {
      ...(await defaultContext()),
    } as any;

    const { admin, adminToken, user, token } = await defaultTokens(ctx.tokenHandler);
    ctx.roleManager.registerRole({
      assignmentCheck: async (u: User) => u.type === UserType.LOCAL_ADMIN,
      name: 'SUPER_ADMIN',
      permissions: {
        PointOfSale: {
          create: { ...allDefinition, ...ownDefintion },
          get: { ...allDefinition, ...ownDefintion },
          update: { ...allDefinition, ...ownDefintion },
          delete: { ...allDefinition, ...ownDefintion },
          approve: { ...allDefinition, ...ownDefintion },
        },
        Container: {
          approve: { ...allDefinition, ...ownDefintion },
          update: { ...allDefinition, ...ownDefintion },
        },
      },
    });
    const superAdminToken = await ctx.tokenHandler.signToken({ user: admin, roles: ['SUPER_ADMIN'], lesser: false }, 'nonce');
    ctx.roleManager.registerRole(RoleFactory(['PointOfSale', 'Transaction', 'Container'], UserType.LOCAL_ADMIN));
    ctx.roleManager.registerRole(RoleFactory(['PointOfSale', 'Transaction', 'Container'], UserType.MEMBER, {
      create: { ...organDefinition },
      get: { ...organDefinition, ...ownDefintion },
      update: { ...organDefinition, ...ownDefintion },
      delete: { ...organDefinition, ...ownDefintion },
    }));

    const organ = await (await UserFactory(await ORGAN_USER())).get();

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts([admin, user], categories, vatGroups);
    const { containers, containerRevisions } = await seedContainers([admin, user], productRevisions);
    const { pointsOfSale, pointOfSaleRevisions } = await seedPointsOfSale([admin, user, organ], containerRevisions);

    const validPOSRequest: CreatePointOfSaleRequest = {
      containers: [containers[0].id, containers[1].id, containers[2].id],
      name: 'Valid POS',
      useAuthentication: true,
      ownerId: 2,
    };

    const organMemberToken = await ctx.tokenHandler.signToken({
      user: user, roles: [UserType[UserType.MEMBER]], organs: [organ], lesser: false,
    }, '1');

    const controller = new PointOfSaleController({ specification: ctx.specification, roleManager: ctx.roleManager });
    const containerController = new ContainerController({ specification: ctx.specification, roleManager: ctx.roleManager });
    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler: ctx.tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/pointsofsale', controller.getRouter());
    ctx.app.use('/containers', containerController.getRouter());

    ctx = {
      ...ctx,
      controller,
      organ,
      pointsOfSale,
      pointOfSaleRevisions,
      validPOSRequest,
      adminToken,
      token,
      admin,
      user,
      organMemberToken,
      superAdminToken,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('PATCH /pointsofsale/{id}', () => {
    it('should patch the use authentication', async () => {
      let res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const pos = res.body as PointOfSaleWithContainersResponse;
      const req: UpdatePointOfSaleRequest = {
        containers: pos.containers.map((c) => c.id),
        name: pos.name,
        useAuthentication: !pos.useAuthentication,
        id: 1,
      };
      res = await request(ctx.app)
        .patch('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.superAdminToken}`)
        .send(req);
      expect(res.status).to.eq(200);
      updatePointOfSaleEq(req, res.body as PointOfSaleWithContainersResponse);
    });
    it('should patch the containers', async () => {
      let res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const pos = res.body as PointOfSaleWithContainersResponse;
      const req: UpdatePointOfSaleRequest = {
        containers: [ctx.validPOSRequest.containers[0]],
        name: pos.name,
        useAuthentication: pos.useAuthentication,
        id: 1,
      };
      res = await request(ctx.app)
        .patch('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.superAdminToken}`)
        .send(req);
      expect(res.status).to.eq(200);
      updatePointOfSaleEq(req, res.body as PointOfSaleWithContainersResponse);
    });
    it('should patch the name', async () => {
      let res = await request(ctx.app)
        .get('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const pos = res.body as PointOfSaleWithContainersResponse;
      const req: UpdatePointOfSaleRequest = {
        containers: pos.containers.map((c) => c.id),
        name: 'New name',
        useAuthentication: pos.useAuthentication,
        id: 1,
      };
      res = await request(ctx.app)
        .patch('/pointsofsale/1')
        .set('Authorization', `Bearer ${ctx.superAdminToken}`)
        .send(req);
      expect(res.status).to.eq(200);
      updatePointOfSaleEq(req, res.body as PointOfSaleWithContainersResponse);
    });
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
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organ.id } } });
      expect(pos).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);
      expect(res.status).to.equal(200);
      expect((res.body as PointOfSaleResponse).id).to.equal(pos.id);
    });
    it('should return an HTTP 403 if not admin and not connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organ.id } } });
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
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organ.id } } });
      expect(pos).to.not.be.undefined;
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);

      expect(ctx.specification.validateModel(
        'PaginatedTransactionResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin and not connected via organ', async () => {
      const pos = await PointOfSale.findOne({ where: { owner: { id: ctx.organ.id } } });
      const res = await request(ctx.app)
        .get(`/pointsofsale/${pos.id}/transactions`)
        .set('Authorization', `Bearer ${ctx.organ}`);
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if the point of sale with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/pointsofsale/${(await PointOfSale.count()) + 1}/transactions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of Sale not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/pointsofsale/1/transactions')
        .set('Authorization', `Bearer ${ctx.token}`);

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

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.be.at.least(1);
    });
    it('should return an HTTP 200 and the containers in the given point of sale if normal user', async () => {
      const { id } = await PointOfSale.findOne({ relations: ['owner'], where: { owner: { id: ctx.user.id } } });

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
      const { id } = await PointOfSale.findOne({ relations: ['owner'], where: { owner: { id: ctx.user.id } } });
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
      const { id } = await PointOfSale.findOne({ relations: ['owner'], where: { owner: { id: ctx.user.id } } });

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
      testValidationOnRoute('post', '/pointsofsale');
    });
    it('should store the given POS and return an HTTP 200 if admin', async () => {
      const count = await PointOfSale.count();
      const res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validPOSRequest);

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
        ownerId: ctx.organ.id,
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
      const databaseProduct = await PointOfSale.findOne({
        where: { id: body.id, currentRevision: body.revision },
      });
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
  describe('Propagating updates', () => {
    it('should propagate updates', async () => {
      let res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.superAdminToken}`)
        .send(ctx.validPOSRequest);
      const posid = res.body.id;
      res = await request(ctx.app)
        .get(`/pointsofsale/${posid}`)
        .set('Authorization', `Bearer ${ctx.superAdminToken}`);
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
        .set('Authorization', `Bearer ${ctx.superAdminToken}`)
        .send(pointOfSaleUpdate);
      expect(res.status).to.equal(200);

      const newPos = res.body as PointOfSaleWithContainersResponse;
      expect(newPos.revision).to.equal(oldPos.revision + 1);


      res = await request(ctx.app)
        .patch(`/containers/${containerId}`)
        .set('Authorization', `Bearer ${ctx.superAdminToken}`)
        .send(containerUpdate);
      expect(res.status).to.equal(200);


      res = await request(ctx.app)
        .get(`/pointsofsale/${posid}`)
        .set('Authorization', `Bearer ${ctx.superAdminToken}`);
      const newerPos = res.body as PointOfSaleWithContainersResponse;
      const newContainer = newerPos.containers.find((c) => c.id === containerId);

      expect(newContainer.name).to.eq(containerUpdate.name);
      expect(newContainer.products.map((p) => p.id)).to.deep.equalInAnyOrder(containerUpdate.products);
    });
  });
});
