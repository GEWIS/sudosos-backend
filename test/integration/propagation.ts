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

import { Connection } from 'typeorm';
import express, { Application } from 'express';
import ProductController from '../../src/controller/product-controller';
import ContainerController from '../../src/controller/container-controller';
import PointOfSaleController from '../../src/controller/point-of-sale-controller';
import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import VatGroup from '../../src/entity/vat-group';
import { ProductResponse } from '../../src/controller/response/product-response';
import { ContainerResponse } from '../../src/controller/response/container-response';
import {
  PointOfSaleResponse,
  PointOfSaleWithContainersResponse,
} from '../../src/controller/response/point-of-sale-response';
import Database from '../../src/database/database';
import { seedProductCategories, seedVatGroups } from '../seed-legacy';
import TokenHandler from '../../src/authentication/token-handler';
import RoleManager from '../../src/rbac/role-manager';
import Swagger from '../../src/start/swagger';
import { json } from 'body-parser';
import TokenMiddleware from '../../src/middleware/token-middleware';
import { expect, request } from 'chai';
import ProductCategory from '../../src/entity/product/product-category';
import { CreateProductRequest, UpdateProductRequest } from '../../src/controller/request/product-request';
import { CreateContainerRequest, UpdateContainerRequest } from '../../src/controller/request/container-request';
import { CreatePointOfSaleRequest } from '../../src/controller/request/point-of-sale-request';
import { truncateAllTables } from '../setup';
import { finishTestDB } from '../helpers/test-helpers';
import { RbacSeeder } from '../seed';

describe('Propagation between products, containers, POSs', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    productController: ProductController,
    containerController: ContainerController,
    posController: PointOfSaleController,
    user: User,
    organ: User,
    token: string,
    vatGroups: VatGroup[],
    categories: ProductCategory[]
    products: ProductResponse[],
    containers: ContainerResponse[],
    pointsOfSale: PointOfSaleResponse[],
    productRequest: CreateProductRequest,
    containerRequest: CreateContainerRequest,
    posRequest: CreatePointOfSaleRequest,
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const user = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    const organ = await User.save({
      firstName: 'Organ',
      type: UserType.ORGAN,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    });

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();

    const app = express();
    const specification = await Swagger.initialize(app);
    const all = { all: new Set<string>(['*']) };

    const roles = await new RbacSeeder().seedRoles([{
      name: 'Admin',
      permissions: {
        Product: {
          create: all,
          get: all,
          update: all,
          delete: all,
          approve: all,
        },
        Container: {
          create: all,
          get: all,
          update: all,
          delete: all,
          approve: all,
        },
        PointOfSale: {
          create: all,
          get: all,
          update: all,
          delete: all,
          approve: all,
        },
      },
      assignmentCheck: async (u: User) => u.type === UserType.LOCAL_ADMIN,
    }]);
    const roleManager = await new RoleManager().initialize();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const token = await tokenHandler.signToken(await new RbacSeeder().getToken(user, roles), 'nonce admin');

    const productController = new ProductController({ specification, roleManager });
    const containerController = new ContainerController({ specification, roleManager });
    const posController = new PointOfSaleController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/products', productController.getRouter());
    app.use('/containers', containerController.getRouter());
    app.use('/pointsOfSale', posController.getRouter());

    const productRequest: CreateProductRequest = {
      ownerId: organ.id,
      name: 'testProduct',
      vat: vatGroups[0].id,
      category: categories[0].id,
      priceInclVat: {
        amount: 390,
        precision: 2,
        currency: 'EUR',
      },
      alcoholPercentage: 3.9,
      featured: true,
      preferred: true,
      priceList: true,
    };

    const containerRequest: CreateContainerRequest = {
      ownerId: organ.id,
      name: 'testContainer',
      public: true,
      products: [],
    };

    const posRequest: CreatePointOfSaleRequest = {
      ownerId: organ.id,
      name: 'testPOS',
      useAuthentication: false,
      containers: [],
    };

    ctx = {
      connection,
      app,
      productController,
      containerController,
      posController,
      user,
      organ,
      token,
      categories,
      vatGroups,
      products: [],
      containers: [],
      pointsOfSale: [],
      productRequest,
      containerRequest,
      posRequest,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('Create and fetch entities', () => {
    it('should create, approve and get product', async () => {
      let res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.records.length).to.equal(0);

      res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.productRequest);
      expect(res.status).to.equal(200);

      res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.records.length).to.equal(1);
      expect(res.body.records[0].name).to.equal('testProduct');

      ctx.products.push(...res.body.records);
      ctx.containerRequest.products = ctx.products.map((p) => p.id);
    });
    it('should create, approve and get container', async () => {
      let res = await request(ctx.app)
        .get('/containers')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.records.length).to.equal(0);

      res = await request(ctx.app)
        .post('/containers')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.containerRequest);
      expect(res.status).to.equal(200);

      res = await request(ctx.app)
        .get('/containers')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.records.length).to.equal(1);
      expect(res.body.records[0].name).to.equal('testContainer');
      expect(res.body.records[0].public).to.equal(true);

      ctx.containers.push(...res.body.records);
      ctx.posRequest.containers = ctx.containers.map((c) => c.id);
    });
    it('should create, approve and get POS', async () => {
      let res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.records.length).to.equal(0);

      res = await request(ctx.app)
        .post('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.posRequest);
      expect(res.status).to.equal(200);

      res = await request(ctx.app)
        .get('/pointsofsale')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.records.length).to.equal(1);
      expect(res.body.records[0].name).to.equal('testPOS');
      expect(res.body.records[0].useAuthentication).to.equal(false);

      ctx.pointsOfSale.push(...res.body.records);
    });
  });

  describe('Propagate updates to parent entities', () => {
    it('should propagate product update to container and POS', async function () {
      if (ctx.products.length === 0 && ctx.containers.length === 0 && ctx.pointsOfSale.length === 0) {
        this.skip();
        return;
      }

      const productUpdate: UpdateProductRequest = {
        name: 'Product updated',
        vat: ctx.productRequest.vat,
        category: ctx.productRequest.category,
        priceInclVat: ctx.productRequest.priceInclVat,
        alcoholPercentage: ctx.productRequest.alcoholPercentage,
        featured: ctx.productRequest.featured,
        preferred: ctx.productRequest.preferred,
        priceList: ctx.productRequest.priceList,
      };

      let res = await request(ctx.app)
        .patch(`/products/${ctx.pointsOfSale[0].id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(productUpdate);
      expect(res.status).to.equal(200);

      res = await request(ctx.app)
        .get(`/pointsofsale/${ctx.pointsOfSale[0].id}`)
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      const pos = res.body as PointOfSaleWithContainersResponse;

      expect(pos.name).to.equal(ctx.posRequest.name);
      expect(pos.useAuthentication).to.equal(ctx.posRequest.useAuthentication);
      expect(pos.owner.id).to.equal(ctx.posRequest.ownerId);
      expect(pos.containers.length).to.equal(ctx.posRequest.containers.length);
      pos.containers.forEach((c) => expect(ctx.posRequest.containers).to.include(c.id));

      const container = pos.containers[0];
      expect(container.name).to.equal(ctx.containerRequest.name);
      expect(container.public).to.equal(ctx.containerRequest.public);
      expect(container.products.length).to.equal(ctx.containerRequest.products.length);
      container.products.forEach((p) => {
        expect(ctx.containerRequest.products).to.include(p.id);
        expect(p.name).to.equal(productUpdate.name);
        expect(p.alcoholPercentage).to.equal(productUpdate.alcoholPercentage);
        expect(p.vat.id).to.equal(productUpdate.vat);
        expect(p.category.id).to.equal(productUpdate.category);
        expect(p.priceInclVat.amount).to.equal(productUpdate.priceInclVat.amount);
      });
    });
    it('should propagate container update to POS', async function () {
      if (ctx.containers.length === 0 && ctx.pointsOfSale.length === 0) {
        this.skip();
        return;
      }

      const containerUpdate: UpdateContainerRequest = {
        products: ctx.containerRequest.products,
        public: ctx.containerRequest.public,
        name: 'Container updated',
      };

      let res = await request(ctx.app)
        .patch(`/containers/${ctx.containers[0].id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(containerUpdate);
      expect(res.status).to.equal(200);

      res = await request(ctx.app)
        .get(`/pointsofsale/${ctx.pointsOfSale[0].id}`)
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      const pos = res.body as PointOfSaleWithContainersResponse;

      expect(pos.name).to.equal(ctx.posRequest.name);
      expect(pos.useAuthentication).to.equal(ctx.posRequest.useAuthentication);
      expect(pos.owner.id).to.equal(ctx.posRequest.ownerId);
      expect(pos.containers.length).to.equal(ctx.posRequest.containers.length);
      pos.containers.forEach((c) => expect(ctx.posRequest.containers).to.include(c.id));

      const container = pos.containers[0];
      expect(container.name).to.equal(containerUpdate.name);
      expect(container.public).to.equal(containerUpdate.public);
      expect(container.products.length).to.equal(containerUpdate.products.length);
      container.products.forEach((p) => expect(containerUpdate.products).to.include(p.id));
    });
  });
});
