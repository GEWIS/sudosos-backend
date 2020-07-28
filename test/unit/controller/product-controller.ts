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
import express, { Application } from 'express';
import { expect, request } from 'chai';
import dinero from 'dinero.js';
import { SwaggerSpecification } from 'swagger-model-validator';
import ProductController from '../../../src/controller/product-controller';
import Product from '../../../src/entity/product';
import { getSpecification } from '../entity/transformer/test-model';

describe('ProductController', (): void => {
  let ctx: {
    app: Application,
    specification: SwaggerSpecification,
    controller: ProductController,
    product: Product,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      specification: undefined,
      controller: undefined,
      product: undefined,
    };
    ctx.specification = await getSpecification(ctx.app);
    ctx.controller = new ProductController(ctx.specification);

    ctx.app.use('/products', ctx.controller.getRouter());
  });

  describe('POST /products', () => {
    it('should be able to create product entity', async () => {
      const res = await request(ctx.app)
        .post('/products')
        .send(ctx.product);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when request contains other owner', async () => {
      const product = { ...ctx.product };
      delete product.owner;

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 400 when request does not contain price', async () => {
      const product = { ...ctx.product };
      delete product.price;

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request price is not default currency', async () => {
      const product = { ...ctx.product, price: dinero({ amount: 1234, currency: 'HRK' }) };

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request price is not default precision', async () => {
      const product = { ...ctx.product, price: dinero({ amount: 1234, currency: 'EUR', precision: 1 }) };

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request does not contain category', async () => {
      const product = { ...ctx.product };
      delete product.category;

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request category does not exist', async () => {
      const product = { ...ctx.product, category: { name: 'non-existant' } };

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request does not contain picture', async () => {
      const product = { ...ctx.product };
      delete product.picture;

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request does not contain alcohol percentage', async () => {
      const product = { ...ctx.product };
      delete product.alcoholPercentage;

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
    });
  });
});
