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
import { expect, request } from 'chai';
import ProductCategoryRequest from '../../../src/controller/request/product-category-request';
import ProductCategoryController from '../../../src/controller/product-category-controller';
import { ProductCategoryResponse } from '../../../src/controller/response/product-category-response';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { seedProductCategories } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import ProductCategory from '../../../src/entity/product/product-category';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';

/**
 * Tests if a productCategory response is equal to the request.
 * @param source - The source from which the productCategory was created.
 * @param response - The received productCategory.
 * @return true if the source and response describe the same product.
 */

describe('ProductCategoryController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: ProductCategoryController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    validRequest: ProductCategoryRequest,
    validRequest2: ProductCategoryRequest,
    invalidRequest: ProductCategoryRequest,
    categories: ProductCategory[],
  };

  // Initialize context
  before(async () => {
    // initialize test database
    const connection = await Database.initialize();

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

    const categories = await seedProductCategories();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: [], lesser: false }, 'nonce');

    const validRequest: ProductCategoryRequest = {
      name: 'Valid productcategory',
    };

    const validRequest2: ProductCategoryRequest = {
      name: 'Valid productcategory 2',
    };

    const invalidRequest: ProductCategoryRequest = {
      name: '',
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };

    // Create roleManager and set roles of Admin and User
    // In this case Admin can do anything and User nothing.
    // This does not reflect the actual roles of the users in the final product.
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        ProductCategory: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new ProductCategoryController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/productcategories', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      validRequest,
      validRequest2,
      invalidRequest,
      categories,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  // Unit test cases
  describe('GET /productcategories', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/productcategories/')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedProductCategoryResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing productcategories in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/productcategories/')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const categories = res.body.records as ProductCategoryResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      // Every productcategory should be returned.
      expect(categories.length).to.equal(Math.min(ctx.categories.length, defaultPagination()));
      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.categories.length);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/productcategories')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/productcategories/')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const categories = res.body.records as ProductCategoryResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      // Every productcategory should be returned.
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(ctx.categories.length);
      expect(categories.length).to.be.at.most(take);
    });
  });
  describe('GET /productcategories/:id', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/productcategories/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ProductCategoryResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the productcategory with given id if admin', async () => {
      const res = await request(ctx.app)
        .get('/productcategories/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((res.body as ProductCategoryResponse).id).to.equal(1);

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/productcategories/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if the productcategory with the given id does not exist', async () => {
      const productCategoryCount = await ProductCategory.count();
      const res = await request(ctx.app)
        .get(`/productcategories/${productCategoryCount + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(await ProductCategory.findOne(productCategoryCount + 1)).to.be.undefined;

      // check if productcategory is not returned
      expect(res.body).to.equal('Productcategory not found.');

      // expected code
      expect(res.status).to.equal(404);
    });
  });
  describe('POST /productcategories', () => {
    it('should store the given productcategory in the database and return an HTTP 200 and the product if admin', async () => {
      const productCategoryCount = await ProductCategory.count();
      const res = await request(ctx.app)
        .post('/productcategories')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validRequest);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ProductCategoryResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      expect(await ProductCategory.count()).to.equal(productCategoryCount + 1);
      expect(ctx.validRequest.name).to.equal(res.body.name);
      const databaseEntry = await ProductCategory.findOne((res.body as ProductCategoryResponse).id);
      expect(databaseEntry).to.exist;
    });
    it('should return an HTTP 400 if the given productcategory is invalid', async () => {
      const productCategoryCount = await ProductCategory.count();
      const res = await request(ctx.app)
        .post('/productcategories')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidRequest);

      expect(await ProductCategory.count()).to.equal(productCategoryCount);
      expect(res.body).to.equal('Invalid productcategory.');

      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const productCategoryCount = await ProductCategory.count();
      const res = await request(ctx.app)
        .post('/productcategories')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validRequest);

      expect(await ProductCategory.count()).to.equal(productCategoryCount);
      expect(res.body).to.be.empty;

      expect(res.status).to.equal(403);
    });
  });
  describe('PATCH /productcategories/:id', () => {
    it('should return an HTTP 200 and the productcategory update if admin', async () => {
      const res = await request(ctx.app)
        .patch('/productcategories/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validRequest2);
      // validRequest2 because validRequest is already in the database
      // and name column must have unique entries.

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ProductCategoryResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      expect(ctx.validRequest2.name).to.equal(res.body.name);
      const databaseEntry = await ProductCategory.findOne((res.body as ProductCategoryResponse).id);
      expect(databaseEntry).to.exist;
    });
    it('should return an HTTP 400 if the update is invalid', async () => {
      const res = await request(ctx.app)
        .patch('/productcategories/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidRequest);

      expect(res.body).to.equal('Invalid productcategory.');
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the productcategory with the given id does not exist', async () => {
      const productCategoryCount = await ProductCategory.count();
      const body = { ...ctx.validRequest };
      body.name = 'TestCaseShouldThrow404';

      const res = await request(ctx.app)
        .patch(`/productcategories/${productCategoryCount + 10}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(body);

      // error code
      expect(res.status).to.equal(404);

      // sanity check
      expect(await ProductCategory.findOne(productCategoryCount + 1)).to.be.undefined;

      // check if productcategory is not returned
      expect(res.body).to.equal('Productcategory not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .patch('/productcategories/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validRequest);

      // check if productcategory is not returned
      expect(res.body).to.be.empty;

      // success code
      expect(res.status).to.equal(403);
    });
  });
});
