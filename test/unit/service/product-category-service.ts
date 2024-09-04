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

import { DataSource } from 'typeorm';
import express from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { expect } from 'chai';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import { seedProductCategories } from '../../seed';
import ProductCategory from '../../../src/entity/product/product-category';
import { ProductCategoryResponse } from '../../../src/controller/response/product-category-response';
import ProductCategoryService from '../../../src/service/product-category-service';
import ProductCategoryRequest from '../../../src/controller/request/product-category-request';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';

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

xdescribe('ProductCategoryService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    specification: SwaggerSpecification,
    categories: ProductCategory[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const categories = await seedProductCategories();

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    // initialize context
    ctx = {
      connection,
      specification,
      categories,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('getProductCategories function', async (): Promise<void> => {
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
    it('should return only root categories', async () => {
      const rootCategories = ctx.categories.filter((c) => c.parent == null);
      const { records } = await ProductCategoryService
        .getProductCategories({ onlyRoot: true });

      expect(records.length).to.equal(rootCategories.length);
      expect(records.map((r) => r.id)).to.deep.equalInAnyOrder(rootCategories.map((c) => c.id));
      records.forEach((c) => {
        expect(c.parent).to.be.undefined;
      });
    });
    it('should return only leaf categories', async () => {
      // Find all categories that are not a parent, i.e. have no children
      const leafCategories = ctx.categories.filter((c) => !ctx.categories
        .some((c2) => c2.parent?.id === c.id));
      const { records } = await ProductCategoryService
        .getProductCategories({ onlyLeaf: true });

      expect(records.length).to.equal(leafCategories.length);
      expect(records.map((r) => r.id)).to.deep.equalInAnyOrder(leafCategories.map((c) => c.id));
      records.forEach((c) => {
        const children = ctx.categories.filter((c2) => c2.parent?.id === c.id);
        expect(children).to.be.lengthOf(0);
      });
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
    it('should be able to create a new productCategory', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2 = await ProductCategoryService.postProductCategory(c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);

      const { records } = await ProductCategoryService
        .getProductCategories({ id: c2.id });

      expect(records.length).to.equal(1);
      expect(records[0].name).to.equal(c1.name);

      // Cleanup
      await ctx.connection.manager.getRepository(ProductCategory).delete(c2.id);
    });
    it('should be able to create a new productCategory with parent', async () => {
      const parent = ctx.categories[0];
      const c1: ProductCategoryRequest = { name: 'test', parentCategoryId: parent.id };
      const c2 = await ProductCategoryService.postProductCategory(c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);
      expect(c2.parent).to.not.be.undefined;
      expect(c2.parent.id).to.equal(parent.id);
      expect(c2.parent.name).to.equal(parent.name);

      const { records } = await ProductCategoryService
        .getProductCategories({ id: c2.id });

      expect(records.length).to.equal(1);
      expect(records[0].name).to.equal(c1.name);
      expect(records[0].parent).to.not.be.undefined;
      expect(records[0].parent.id).to.equal(parent.id);

      // Cleanup
      await ctx.connection.manager.getRepository(ProductCategory).delete(c2.id);
    });
    it('should not be able to create an invalid productCategory', async () => {
      const c1: ProductCategoryRequest = { name: null };
      const promise = ProductCategoryService.postProductCategory(c1);
      await expect(promise).to.eventually.be.rejected;

      const { records } = await ProductCategoryService
        .getProductCategories();
      expect(records).to.be.lengthOf(ctx.categories.length);
    });
  });
  describe('patchProductCategory function', async (): Promise<void> => {
    it('should be able to patch a productCategory', async () => {
      const category = ctx.categories[0];
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2: ProductCategoryResponse = await ProductCategoryService
        .patchProductCategory(category.id, c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);

      const { records } = await ProductCategoryService
        .getProductCategories({ id: category.id });

      expect(records).to.not.be.null;
      expect(records[0].name).to.equal(c1.name);

      // Cleanup
      await ctx.connection.manager.save(ProductCategory, category);
    });
    it('should not be able to patch an invalid productCategory id', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2: ProductCategoryResponse = await ProductCategoryService
        .patchProductCategory(ctx.categories.length + 1, c1);
      expect(c2).to.be.null;
    });
  });
  describe('deleteProductCategory function', async (): Promise<void> => {
    it('should be able to delete a productCategory', async () => {
      const category = ctx.categories.find((c) => c.parent != null);
      const res: ProductCategoryResponse = await ProductCategoryService
        .deleteProductCategory(category.id);

      expect(res).to.not.be.null;
      expect(res.id).to.equal(category.id);
      expect(res.name).to.equal(category.name);

      // Cleanup
      await ctx.connection.manager.save(ProductCategory, category);
    });
    it('should not be able to delete a productCategory with children', async () => {
      const category = ctx.categories.find((c) => c.parent == null);
      const res: ProductCategoryResponse = await ProductCategoryService
        .deleteProductCategory(category.id);

      expect(res).to.be.null;
    });
    it('should not be able to delete an invalid productCategory id', async () => {
      const res: ProductCategoryResponse = await ProductCategoryService
        .deleteProductCategory(ctx.categories.length + 1);

      expect(res).to.be.null;
    });
  });
});
