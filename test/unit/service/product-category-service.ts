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
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import { seedProductCategories } from '../../seed';
import ProductCategory from '../../../src/entity/product/product-category';
import { ProductCategoryResponse } from '../../../src/controller/response/product-category-response';
import ProductCategoryService from '../../../src/service/product-category-service';
import ProductCategoryRequest from '../../../src/controller/request/product-category-request';

/**
 * Test if the set of productCategory responses is equal to the full set of productCategories.
 * @param response
 * @param equalset
 */
function productCategoryEqualset(
  response: ProductCategoryResponse[],
  equalset: ProductCategory[],
): Boolean {
  const responseIsSuperSet = response.every((pc1: ProductCategoryResponse) => (
    equalset.some((pc2: ProductCategory) => (
      pc2.id === pc1.id && pc2.name === pc1.name
    ))
  ));
  const equalsetIsSuperSet = equalset.every((pc1: ProductCategory) => (
    response.some((pc2: ProductCategoryResponse) => (
      pc2.id === pc1.id && pc2.name === pc1.name
    ))
  ));
  return (responseIsSuperSet && equalsetIsSuperSet);
}

describe('ProductCategoryService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    categories: ProductCategory[],
  };
  describe('getProductCategories function', async (): Promise<void> => {
    before(async () => {
      const connection = await Database.initialize();

      const categories = await seedProductCategories();

      // start app
      const app = express();
      const specification = await Swagger.initialize(app);
      app.use(bodyParser.json());

      // initialize context
      ctx = {
        connection,
        app,
        specification,
        categories,
      };
    });

    after(async () => {
      await ctx.connection.dropDatabase();
      await ctx.connection.close();
    });

    it('should return all productCategories', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ProductCategoryService.getProductCategories();

      expect(productCategoryEqualset(records, ctx.categories)).to.be.true;
      expect(records.every(
        (c: ProductCategoryResponse) => ctx.specification.validateModel(
          'ProductCategoryResponse',
          c,
          false,
          true,
        ).valid,
      )).to.be.true;

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(ctx.categories.length);
    });
    it('should return a single productCategory if id is specified', async () => {
      const { records } = await ProductCategoryService
        .getProductCategories({ id: ctx.categories[0].id });

      expect(records.length).to.equal(1);
      expect(records[0].id).to.equal(ctx.categories[0].id);
      expect(records[0].name).to.equal(ctx.categories[0].name);
    });
    it('should return nothing if a wrong id is specified', async () => {
      const { records } = await ProductCategoryService
        .getProductCategories({ id: ctx.categories.length + 1 });

      expect(records).to.be.empty;
    });
    it('should return a single productCategory if name is specified', async () => {
      const { records } = await ProductCategoryService
        .getProductCategories({ name: ctx.categories[0].name });

      expect(records.length).to.equal(1);
      expect(records[0].id).to.equal(ctx.categories[0].id);
      expect(records[0].name).to.equal(ctx.categories[0].name);
    });
    it('should return nothing if a wrong name is specified', async () => {
      const { records } = await ProductCategoryService
        .getProductCategories({ name: 'non-existing' });

      expect(records).to.be.empty;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ProductCategoryService
        .getProductCategories({}, { take, skip });

      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(ctx.categories.length);
      expect(records.length).to.be.at.most(take);
    });
  });
  describe('postProductCategory function', () => {
    beforeEach(async () => {
      const connection = await Database.initialize();
      const categories: ProductCategory[] = [];

      // start app
      const app = express();
      const specification = await Swagger.initialize(app);
      app.use(bodyParser.json());

      // initialize context
      ctx = {
        connection,
        app,
        specification,
        categories,
      };
    });

    afterEach(async () => {
      // close database connection
      await ctx.connection.dropDatabase();
      await ctx.connection.close();
    });

    it('should be able to post a new productCategory', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2 = await ProductCategoryService.postProductCategory(c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);

      const { records } = await ProductCategoryService
        .getProductCategories({ id: 1 });

      expect(records.length).to.equal(1);
      expect(records[0].name).to.equal(c1.name);
    });
    it('should not be able to post an invalid productCategory', async () => {
      const c1: ProductCategoryRequest = { name: null };
      const promise = ProductCategoryService.postProductCategory(c1);
      await expect(promise).to.eventually.be.rejected;

      const { records } = await ProductCategoryService
        .getProductCategories({ id: 1 });
      expect(records).to.be.empty;
    });
  });
  describe('patchProductCategory function', async (): Promise<void> => {
    beforeEach(async () => {
      const connection = await Database.initialize();

      const categories = await seedProductCategories();

      // start app
      const app = express();
      const specification = await Swagger.initialize(app);
      app.use(bodyParser.json());

      // initialize context
      ctx = {
        connection,
        app,
        specification,
        categories,
      };
    });

    afterEach(async () => {
      // close database connection
      await ctx.connection.dropDatabase();
      await ctx.connection.close();
    });

    it('should be able to patch a productCategory', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2: ProductCategoryResponse = await ProductCategoryService
        .patchProductCategory(ctx.categories[0].id, c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);

      const { records } = await ProductCategoryService
        .getProductCategories({ id: ctx.categories[0].id });

      expect(records).to.not.be.null;
      expect(records[0].name).to.equal(c1.name);
    });
    it('should not be able to patch an invalid productCategory id', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2: ProductCategoryResponse = await ProductCategoryService
        .patchProductCategory(ctx.categories.length + 1, c1);
      expect(c2).to.be.null;
    });
  });
  describe('deleteProductCategory function', async (): Promise<void> => {
    beforeEach(async () => {
      const connection = await Database.initialize();

      const categories = await seedProductCategories();

      // start app
      const app = express();
      const specification = await Swagger.initialize(app);
      app.use(bodyParser.json());

      // initialize context
      ctx = {
        connection,
        app,
        specification,
        categories,
      };
    });

    afterEach(async () => {
      // close database connection
      await ctx.connection.dropDatabase();
      await ctx.connection.close();
    });

    it('should be able to delete a productCategory', async () => {
      const res: ProductCategoryResponse = await ProductCategoryService
        .deleteProductCategory(ctx.categories[0].id);

      expect(res).to.not.be.null;
      expect(res.id).to.equal(ctx.categories[0].id);
      expect(res.name).to.equal(ctx.categories[0].name);
    });
    it('should not be able to delete an invalid productCategory id', async () => {
      const res: ProductCategoryResponse = await ProductCategoryService
        .deleteProductCategory(ctx.categories.length + 1);

      expect(res).to.be.null;
    });
  });
});
