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

import { Connection, FindManyOptions } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import ProductCategoryRequest from '../../../src/controller/request/product-category-request';
import ProductCategoryController from '../../../src/controller/product-category-controller';
import { ProductCategoryResponse } from '../../../src/controller/response/product-category-response';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { seedProductCategories } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import ProductCategory from '../../../src/entity/product/product-category';
import { ProductResponse } from '../../../src/controller/response/product-response';

/**
 * Tests if a productCategory response is equal to the request.
 * @param source - The source from which the productCategory was created.
 * @param response - The received productCategory.
 * @return true if the source and response describe the same product.
 */
function productCategoryEq(source: ProductCategoryRequest, response: ProductCategoryResponse) {
  return source.name === response.name;
}

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
    validProductCategoryReq: ProductCategoryRequest,
    invalidProductCategoryReq: ProductCategoryRequest,
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
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    await seedProductCategories();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: [] }, 'nonce');

    const validProductCategoryReq: ProductCategoryRequest = {
      name: 'Valid productCategory',
    };

    const invalidProductCategoryReq: ProductCategoryRequest = {
      name: '',
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Product: {
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
      validProductCategoryReq,
      invalidProductCategoryReq,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  // Unit test cases
  describe('GET /productscategories', () => {
    it('should return an HTTP 200 and all existing productCategories in the database if user', async () => {
      const res = await request(ctx.app)
        .get('/productcategories')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);

      // Every productCategory that has a current revision should be returned.
      const productCategoryCount = await ProductCategory.count();
      expect((res.body as ProductCategoryResponse[]).length).to.equal(productCategoryCount);
    });
  });
});
