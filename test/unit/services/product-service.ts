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
import bodyParser from 'body-parser';
import { expect } from 'chai';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import TokenHandler from '../../../src/authentication/token-handler';
import ProductService from '../../../src/services/product-service';
import { seedAllProducts, seedProductCategories, seedUsers } from '../../seed';
import Product from '../../../src/entity/product/product';
import { ProductResponse } from '../../../src/controller/response/product-response';

/**
 * Test if all the product responses are part of the product set array.
 * @param response
 * @param superset
 */
function productSuperset(response: ProductResponse[], superset: Product[]): Boolean {
  return response.every((searchProduct: ProductResponse) => (
    superset.find((supersetProduct: Product) => (
      supersetProduct.id === searchProduct.id && supersetProduct.owner.id === searchProduct.owner.id
    )) !== undefined
  ));
}

describe('ProductService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    users: User[],
    allProducts: Product[],
  };

  beforeEach(async () => {
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

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser }, 'nonce');

    const users = await seedUsers();
    const categories = await seedProductCategories();
    await seedAllProducts(users, categories);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());

    //  Load all products from the database.
    const allProducts: Product[] = await Product.find({ relations: ['owner'] });

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      adminUser,
      localUser,
      adminToken,
      token,
      users,
      allProducts,
    };
  });

  // close database connection
  afterEach(async () => {
    await ctx.connection.close();
  });

  describe('getProducts function', () => {
    it('should return all products with no input specification', async () => {
      const res: ProductResponse[] = await ProductService.getProducts();

      expect(productSuperset(res, ctx.allProducts)).to.be.true;
    });
    it('should return product with the owner specified', async () => {
      const res: ProductResponse[] = await ProductService.getProducts(ctx.allProducts[0].owner);

      expect(productSuperset(res, ctx.allProducts)).to.be.true;

      const belongsToOwner = res.every((product: ProductResponse) => (
        product.owner.id === ctx.allProducts[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return a single product if productId is specified', async () => {
      const res: ProductResponse[] = await ProductService
        .getProducts(null, true, ctx.allProducts[0].id);

      expect(res).to.be.length(1);
      expect(res[0].id).to.be.equal(ctx.allProducts[0].id);
    });
  });
});
