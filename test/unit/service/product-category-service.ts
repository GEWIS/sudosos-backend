/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

import { DataSource } from 'typeorm';
import express from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { expect } from 'chai';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ProductCategory from '../../../src/entity/product/product-category';
import ProductCategoryService from '../../../src/service/product-category-service';
import ProductCategoryRequest from '../../../src/controller/request/product-category-request';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { ProductCategorySeeder } from '../../seed';

/**
 * Test if the set of productCategories is equal to the full set of productCategories.
 * @param result
 * @param equalset
 */
function productCategoryEqualset(
  result: ProductCategory[],
  equalset: ProductCategory[],
): Boolean {
  const resultIsSuperSet = result.every((pc1: ProductCategory) => (
    equalset.some((pc2: ProductCategory) => (
      pc2.id === pc1.id && pc2.name === pc1.name
    ))
  ));
  const equalsetIsSuperSet = equalset.every((pc1: ProductCategory) => (
    result.some((pc2: ProductCategory) => (
      pc2.id === pc1.id && pc2.name === pc1.name
    ))
  ));
  return (resultIsSuperSet && equalsetIsSuperSet);
}

describe('ProductCategoryService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    specification: SwaggerSpecification,
    categories: ProductCategory[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const categories = await new ProductCategorySeeder().seed();

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
      const [categories, count] = await ProductCategoryService.getProductCategories();

      expect(productCategoryEqualset(categories, ctx.categories)).to.be.true;

      const responses = categories.map(ProductCategoryService.asProductCategoryResponse);
      expect(responses.every(
        (c) => ctx.specification.validateModel(
          'ProductCategoryResponse',
          c,
          false,
          true,
        ).valid,
      )).to.be.true;

      expect(count).to.equal(ctx.categories.length);
    });
    it('should return a single productCategory if id is specified', async () => {
      const [categories] = await ProductCategoryService
        .getProductCategories({ id: ctx.categories[0].id });

      expect(categories.length).to.equal(1);
      expect(categories[0].id).to.equal(ctx.categories[0].id);
      expect(categories[0].name).to.equal(ctx.categories[0].name);
    });
    it('should return nothing if a wrong id is specified', async () => {
      const [categories] = await ProductCategoryService
        .getProductCategories({ id: ctx.categories.length + 1 });

      expect(categories).to.be.empty;
    });
    it('should return a single productCategory if name is specified', async () => {
      const [categories] = await ProductCategoryService
        .getProductCategories({ name: ctx.categories[0].name });

      expect(categories.length).to.equal(1);
      expect(categories[0].id).to.equal(ctx.categories[0].id);
      expect(categories[0].name).to.equal(ctx.categories[0].name);
    });
    it('should return nothing if a wrong name is specified', async () => {
      const [categories] = await ProductCategoryService
        .getProductCategories({ name: 'non-existing' });

      expect(categories).to.be.empty;
    });
    it('should return only root categories', async () => {
      const rootCategories = ctx.categories.filter((c) => c.parent == null);
      const [categories] = await ProductCategoryService
        .getProductCategories({ onlyRoot: true });

      expect(categories.length).to.equal(rootCategories.length);
      expect(categories.map((r) => r.id)).to.deep.equalInAnyOrder(rootCategories.map((c) => c.id));
      categories.forEach((c) => {
        expect(c.parent).to.satisfy((p: any) => p == null);
      });
    });
    it('should return only leaf categories', async () => {
      // Find all categories that are not a parent, i.e. have no children
      const leafCategories = ctx.categories.filter((c) => !ctx.categories
        .some((c2) => c2.parent?.id === c.id));
      const [categories] = await ProductCategoryService
        .getProductCategories({ onlyLeaf: true });

      expect(categories.length).to.equal(leafCategories.length);
      expect(categories.map((r) => r.id)).to.deep.equalInAnyOrder(leafCategories.map((c) => c.id));
      categories.forEach((c) => {
        const children = ctx.categories.filter((c2) => c2.parent?.id === c.id);
        expect(children).to.be.lengthOf(0);
      });
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const [categories, count] = await ProductCategoryService
        .getProductCategories({}, { take, skip });

      expect(count).to.equal(ctx.categories.length);
      expect(categories.length).to.be.at.most(take);
    });
  });
  describe('postProductCategory function', () => {
    it('should be able to create a new productCategory', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2 = await ProductCategoryService.postProductCategory(c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);

      const [categories] = await ProductCategoryService
        .getProductCategories({ id: c2.id });

      expect(categories.length).to.equal(1);
      expect(categories[0].name).to.equal(c1.name);

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

      const [categories] = await ProductCategoryService
        .getProductCategories({ id: c2.id });

      expect(categories.length).to.equal(1);
      expect(categories[0].name).to.equal(c1.name);
      expect(categories[0].parent).to.not.be.undefined;
      expect(categories[0].parent.id).to.equal(parent.id);

      // Cleanup
      await ctx.connection.manager.getRepository(ProductCategory).delete(c2.id);
    });
    it('should not be able to create an invalid productCategory', async () => {
      const c1: ProductCategoryRequest = { name: null };
      const promise = ProductCategoryService.postProductCategory(c1);
      await expect(promise).to.eventually.be.rejected;

      const [categories] = await ProductCategoryService
        .getProductCategories();
      expect(categories).to.be.lengthOf(ctx.categories.length);
    });
  });
  describe('patchProductCategory function', async (): Promise<void> => {
    it('should be able to patch a productCategory', async () => {
      const category = ctx.categories[0];
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2: ProductCategory = await ProductCategoryService
        .patchProductCategory(category.id, c1);
      expect(c2).to.not.be.null;
      expect(c2.name).to.equal(c1.name);

      const [categories] = await ProductCategoryService
        .getProductCategories({ id: category.id });

      expect(categories).to.not.be.null;
      expect(categories[0].name).to.equal(c1.name);

      // Cleanup
      await ctx.connection.manager.save(ProductCategory, category);
    });
    it('should not be able to patch an invalid productCategory id', async () => {
      const c1: ProductCategoryRequest = { name: 'test' };
      const c2: ProductCategory = await ProductCategoryService
        .patchProductCategory(ctx.categories.length + 1, c1);
      expect(c2).to.be.null;
    });
  });
  describe('deleteProductCategory function', async (): Promise<void> => {
    it('should be able to delete a productCategory', async () => {
      const category = ctx.categories.find((c) => c.parent != null);
      const res: ProductCategory = await ProductCategoryService
        .deleteProductCategory(category.id);

      expect(res).to.not.be.null;
      expect(res.id).to.equal(category.id);
      expect(res.name).to.equal(category.name);

      // Cleanup
      await ctx.connection.manager.save(ProductCategory, category);
    });
    it('should not be able to delete a productCategory with children', async () => {
      const category = ctx.categories.find((c) => c.parent == null);
      const res: ProductCategory = await ProductCategoryService
        .deleteProductCategory(category.id);

      expect(res).to.be.null;
    });
    it('should not be able to delete an invalid productCategory id', async () => {
      const res: ProductCategory = await ProductCategoryService
        .deleteProductCategory(ctx.categories.length + 1);

      expect(res).to.be.null;
    });
  });
});
