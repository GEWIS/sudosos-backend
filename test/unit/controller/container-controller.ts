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

import {
  Connection, IsNull, Not,
} from 'typeorm';
import express, { Application } from 'express';
import chai, { request, expect } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import {
  seedContainers, seedProductCategories, seedProducts, seedVatGroups,
} from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import ContainerController from '../../../src/controller/container-controller';
import Container from '../../../src/entity/container/container';
import {
  ContainerResponse,
  ContainerWithProductsResponse,
  PaginatedContainerResponse,
} from '../../../src/controller/response/container-response';
import { ProductResponse } from '../../../src/controller/response/product-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { CreateContainerRequest, UpdateContainerRequest } from '../../../src/controller/request/container-request';
import { INVALID_ORGAN_ID, INVALID_PRODUCT_ID } from '../../../src/controller/request/validators/validation-errors';
import ContainerRevision from '../../../src/entity/container/container-revision';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import Product from '../../../src/entity/product/product';
import { getToken, seedRole } from '../../seed/rbac';

chai.use(deepEqualInAnyOrder);

/**
 * Tests if a container response is equal to the request.
 * @param source - The source from which the container was created.
 * @param response - The received container.
 */
function containerEq(source: CreateContainerRequest, response: ContainerResponse) {
  expect(source.name).to.equal(response.name);
  expect(source.public).to.equal(response.public);
}

function asRequested(requested: Container, response: ContainerResponse) {
  expect(response.id).to.eq(requested.id);
  expect(response.owner.id).to.eq(requested.owner.id);
  expect(response.public).to.eq(requested.public);
}

function containerProductsEq(source: CreateContainerRequest,
  response: ContainerWithProductsResponse) {
  containerEq(source, response);
  expect(response.products.map((p) => p.id)).to.deep.equalInAnyOrder(source.products);
}

describe('ContainerController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: ContainerController,
    adminUser: User,
    localUser: User,
    organ: User,
    adminToken: String,
    organMemberToken: String,
    token: String,
    products: Product[],
    deletedProducts: Product[],
    containers: Container[],
    deletedContainers: Container[],
    validContainerReq: CreateContainerRequest,
    validContainerUpdate: UpdateContainerRequest,
  };

  // Initialize context
  before(async () => {
    // initialize test database
    const connection = await Database.initialize();
    await truncateAllTables(connection);

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
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const organ = {
      id: 3,
      firstName: 'Organ',
      type: UserType.ORGAN,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    await User.save(organ);

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { products, productRevisions } = (
      await seedProducts([adminUser, localUser], categories, vatGroups));
    const { containers } = await seedContainers([adminUser, localUser], productRevisions);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const validContainerUpdate: UpdateContainerRequest = {
      products: products.filter((p) => p.deletedAt == null).slice(0, 2).map((p) => p.id),
      public: true,
      name: 'Valid container',
    };

    const validContainerReq: CreateContainerRequest = {
      ...validContainerUpdate,
      ownerId: organ.id,
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']), public: new Set<string>(['*']) };
    const organRole = { organ: new Set<string>(['*']) };

    const roles = await seedRole([{
      name: 'Admin',
      permissions: {
        Container: {
          create: all,
          get: all,
          update: all,
          delete: all,
          approve: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        Container: {
          get: own,
          create: own,
          update: own,
          delete: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.MEMBER,
    }, {
      name: 'Seller',
      permissions: {
        Container: {
          get: organRole,
        },
      },
      assignmentCheck: async () => true,
    }]);
    const roleManager = await new RoleManager().initialize();

    const adminToken = await tokenHandler.signToken(await getToken(adminUser, roles), 'nonce admin');
    const token = await tokenHandler.signToken(await getToken(localUser, roles), 'nonce');
    const organMemberToken = await tokenHandler.signToken(await getToken(localUser, roles, [organ]), 'nonce organ');

    const controller = new ContainerController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/containers', controller.getRouter());

    // initialize context
    ctx = {
      organ,
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      organMemberToken,
      token,
      products: products.filter((p) => p.deletedAt == null),
      deletedProducts: products.filter((p) => p.deletedAt != null),
      containers: containers.filter((c) => c.deletedAt == null),
      deletedContainers: containers.filter((c) => c.deletedAt != null),
      validContainerReq,
      validContainerUpdate,
    };
  });

  // close database connection
  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /containers', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedContainerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing containers in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/containers')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const containers = res.body.records as ContainerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(res.status).to.equal(200);

      // Every container that has a current revision should be returned.
      const activeContainerCount = await Container.count({
        where: { currentRevision: Not(IsNull()) },
      });
      expect(containers.length).to.equal(activeContainerCount);

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activeContainerCount);
    });
    it('should return an HTTP 403 and no containers if not admin', async () => {
      const res = await request(ctx.app)
        .get('/containers')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/containers')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const containers = res.body.records as ContainerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const activeContainerCount = await Container.count({
        where: { currentRevision: Not(IsNull()) },
      });
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(activeContainerCount);
      expect(containers.length).to.be.at.most(take);
    });
  });
  describe('GET /containers/:id', () => {
    async function getAndCheck(container: Container, token: String) {
      const res = await request(ctx.app)
        .get(`/containers/${container.id}`)
        .set('Authorization', `Bearer ${token}`);

      // success code
      expect(res.status).to.equal(200);
      expect(res.body).to.not.be.empty;
      asRequested(container, res.body);
      const valid = (ctx.specification.validateModel(
        'ContainerWithProductsResponse',
        res.body,
        false,
        true,
      ));
      expect(valid.valid).to.be.true;
    }
    it('should return an HTTP 200 and the container with the given id if admin', async () => {
      const container = ctx.containers[0];
      expect(container).to.not.be.undefined;
      await getAndCheck(container, ctx.adminToken);
    });
    it('should return an HTTP 200 and the container with the given id if own container', async () => {
      const container = ctx.containers.find((c) => !c.public && c.owner.id === ctx.localUser.id);
      expect(container).to.not.be.undefined;
      await getAndCheck(container, ctx.token);
    });
    it('should return an HTTP 200 and container if the container is public and not admin', async () => {
      const container = ctx.containers.find((c) => c.public && c.owner.id !== ctx.localUser.id);
      expect(container).to.not.be.undefined;
      await getAndCheck(container, ctx.token);
    });
    it('should return an HTTP 200 and the container if the user is connected via organ', async () => {
      const newContainer = await Container.save({
        owner: ctx.organ,
        public: false,
        currentRevision: 1,
      });
      await ContainerRevision.save({
        container: newContainer,
        name: 'ORGAN Container',
        revision: 1,
        products: [],
      });
      await getAndCheck(newContainer, ctx.organMemberToken);
    });
    it('should return an HTTP 403 if the container exist but is not visible to the user', async () => {
      const { id } = ctx.containers.find((c) => !c.public && c.owner.id !== ctx.localUser.id);
      const test = await request(ctx.app)
        .get(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((test.body as ContainerResponse).public).to.be.false;
      expect((test.body as ContainerResponse).owner.id).to.not.equal(ctx.localUser.id);
      expect((test.body as ContainerResponse).id).to.equal(id);

      const res = await request(ctx.app)
        .get(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      // success code
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if the container is soft deleted', async () => {
      const id = ctx.deletedContainers[0].id;
      const res = await request(ctx.app)
        .get(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check if banner is not returned
      expect(res.body).to.equal('Container not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 404 if the containerId does not exist', async () => {
      const id = (await Container.count()) + 10;
      const res = await request(ctx.app)
        .get(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check if banner is not returned
      expect(res.body).to.equal('Container not found.');

      // success code
      expect(res.status).to.equal(404);
    });
  });
  describe('GET /containers/:id/products', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/containers/1/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      res.body.forEach((p: ProductResponse) => {
        expect(ctx.specification.validateModel(
          'ProductResponse',
          p,
          false,
          true,
        ).valid).to.be.true;
      });
    });
    it('should return an HTTP 200 and all the products in the container if admin', async () => {
      const res = await request(ctx.app)
        .get('/containers/1/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((res.body as ProductResponse[])).to.not.be.empty;
      expect(res.status).to.equal(200);

      const body = res.body as ProductResponse[];

      // Never include deleted containers
      const deletedProductIds = ctx.deletedProducts.map((p) => p.id);
      body.forEach((product) => expect(deletedProductIds).to.not.include(product.id));
    });
    it('should return an HTTP 403 if container not public or own and if not admin', async () => {
      const { id } = await Container.findOne({ relations: ['owner'], where: { owner: { id: ctx.adminUser.id }, public: true } });
      const res = await request(ctx.app)
        .get(`/containers/${id}/products`)
        .set('Authorization', `Bearer ${ctx.localUser}`);

      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 200 and all the products in the container if public and if admin', async () => {
      const { id } = await Container.findOne({ relations: ['owner'], where: { owner: { id: ctx.localUser.id }, public: true } });

      const res = await request(ctx.app)
        .get(`/containers/${id}/products`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
    });
  });

  function testValidationOnRoute(type: any, route: string) {
    async function expectError(req: CreateContainerRequest, error: string) {
      // @ts-ignore
      const res = await ((request(ctx.app)[type])(route)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req));
      expect(res.status).to.eq(400);
      expect(res.body).to.eq(error);
    }

    describe('validate products function', () => {
      it('should verify products exist', async () => {
        const containerRequest = type === 'post' ? ctx.validContainerReq : ctx.validContainerUpdate;
        const productId = ctx.products.length + ctx.deletedProducts.length + 10;
        const req: CreateContainerRequest = {
          ...containerRequest,
          products: [productId],
        };
        await expectError(req, `Products: ${INVALID_PRODUCT_ID(productId).value}`);
      });
      it('should verify product is not soft deleted', async () => {
        const containerRequest = type === 'post' ? ctx.validContainerReq : ctx.validContainerUpdate;
        const productId = ctx.deletedProducts[0].id;
        const req: CreateContainerRequest = {
          ...containerRequest,
          products: [productId],
        };
        await expectError(req, `Products: ${INVALID_PRODUCT_ID(productId).value}`);
      });
    });
    it('should verify Name', async () => {
      const containerRequest = type === 'post' ? ctx.validContainerReq : ctx.validContainerUpdate;
      const req: CreateContainerRequest = { ...containerRequest, name: '' };
      await expectError(req, 'Name: must be a non-zero length string.');
    });
    if (type === 'post') {
      it('should validate that owner is an Organ', async () => {
        const owner = await User.findOne({ where: { deleted: false, type: UserType.MEMBER } });
        const req: CreateContainerRequest = { ...ctx.validContainerReq, ownerId: owner.id };
        await expectError(req, INVALID_ORGAN_ID().value);
      });
    }
  }
  describe('POST /containers', () => {
    describe('verifyContainerRequest Specification', async () => {
      testValidationOnRoute('post', '/containers');
    });
    it('should store the given container in the database and return an HTTP 200 and the created container if user', async () => {
      const containerCount = await Container.count();
      const res = await request(ctx.app)
        .post('/containers')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validContainerReq);

      expect(res.status).to.equal(200);
      const containerResponse = res.body as ContainerWithProductsResponse;
      expect(ctx.specification.validateModel(
        'ContainerWithProductsResponse',
        containerResponse,
        false,
        true,
      ).valid).to.be.true;

      expect(await Container.count()).to.equal(containerCount + 1);
      containerProductsEq(ctx.validContainerReq, containerResponse);

      const dbContainer = await Container.findOne({
        where: { id: (res.body as ContainerResponse).id },
      });
      expect(dbContainer).to.exist;

      // Cleanup
      await ContainerRevision.delete({ containerId: dbContainer.id });
      await Container.delete({ id: dbContainer.id });
    });
  });
  describe('PATCH /containers/:id', () => {
    describe('verifyContainerRequest Specification', async () => {
      testValidationOnRoute('patch', '/containers/1');
    });
    it('should return an HTTP 200 and the container update if user', async () => {
      const res = await request(ctx.app)
        .patch('/containers/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validContainerUpdate);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ContainerWithProductsResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as ContainerWithProductsResponse;
      containerProductsEq(ctx.validContainerReq, res.body as ContainerWithProductsResponse);

      const databaseContainer = await Container.findOne({
        where: { id: body.id, currentRevision: body.revision },
      });
      expect(databaseContainer).to.exist;
    });
    it('should return an HTTP 200 and the container update if admin', async () => {
      const res = await request(ctx.app)
        .patch('/containers/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validContainerUpdate);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ContainerWithProductsResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as ContainerWithProductsResponse;
      containerProductsEq(ctx.validContainerReq, res.body as ContainerWithProductsResponse);

      const databaseContainer = await Container.findOne({
        where: { id: body.id, currentRevision: body.revision },
      });
      expect(databaseContainer).to.exist;
    });
    it('should return an HTTP 200 and override a previous update if admin', async () => {
      const { id } = ctx.containers[0];

      const products = ctx.products.slice(0, 2);
      const newUpdate: CreateContainerRequest = {
        public: true,
        name: 'Valid Container Update',
        products: products.map((p) => p.id),
      };

      const res = await request(ctx.app)
        .patch(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validContainerUpdate);

      containerProductsEq(ctx.validContainerReq, res.body as ContainerWithProductsResponse);

      const updateRes = await request(ctx.app)
        .patch(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newUpdate);

      containerProductsEq(newUpdate, updateRes.body as ContainerWithProductsResponse);
      expect(updateRes.status).to.equal(200);
    });
    it('should return an HTTP 400 if the update is invalid', async () => {
      const inValidContainerUpdate: UpdateContainerRequest = {
        ...ctx.validContainerUpdate,
        name: '',
      };

      const res = await request(ctx.app)
        .patch('/containers/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(inValidContainerUpdate);

      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the container with the given id does not exist', async () => {
      const id = await Container.count({ withDeleted: true }) + 1;
      const res = await request(ctx.app)
        .patch(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validContainerUpdate);

      // sanity check
      expect(await Container.findOne({ where: { id } })).to.be.null;

      // check if banner is not returned
      expect(res.body).to.equal('Container not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin nor owner and not public', async () => {
      const { id } = await Container.findOne({ relations: ['owner'], where: { owner: { id: ctx.adminUser.id }, public: false } });

      const res = await request(ctx.app)
        .patch(`/containers/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validContainerUpdate);

      // success code
      expect(res.status).to.equal(403);
    });
  });
  describe('GET /containers/public', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/containers/public')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedContainerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all public containers', async () => {
      const res = await request(ctx.app)
        .get('/containers/public')
        .set('Authorization', `Bearer ${ctx.token}`);

      (res.body as PaginatedContainerResponse).records.every(
        async (container) => (expect(container.public).true),
      );
      expect(res.status).to.equal(200);
    });
  });
  describe('DELETE /containers/:id', () => {
    it('should return 204 if owner', async () => {
      const container = ctx.containers.find((p) => p.owner.id === ctx.localUser.id && !p.public && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/containers/${container.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send();

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbContainer = await Container.findOne({ where: { id: container.id }, withDeleted: true });
      expect(dbContainer).to.not.be.null;
      expect(dbContainer.deletedAt).to.not.be.null;

      // Cleanup
      await dbContainer.recover();
    });
    it('should return 204 for any container if admin', async () => {
      const container = ctx.containers.find((p) => p.owner.id !== ctx.adminUser.id && !p.public && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/containers/${container.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbContainer = await Container.findOne({ where: { id: container.id }, withDeleted: true });
      expect(dbContainer).to.not.be.null;
      expect(dbContainer.deletedAt).to.not.be.null;

      // Cleanup
      await dbContainer.recover();
    });
    it('should return 403 if not owner', async () => {
      const container = ctx.containers.find((p) => p.owner.id === ctx.adminUser.id && !p.public && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/containers/${container.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send();

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should return 404 if container does not exist', async () => {
      const containerId = ctx.containers.length + ctx.deletedContainers.length + 2;

      const res = await request(ctx.app)
        .delete(`/containers/${containerId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Container not found');
    });
    it('should return 404 if container is soft deleted', async () => {
      const containerId = ctx.deletedContainers[0].id;

      const res = await request(ctx.app)
        .delete(`/containers/${containerId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Container not found');
    });
  });
});
