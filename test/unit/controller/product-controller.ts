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
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import bodyParser from 'body-parser';
import dinero, { DineroObject } from 'dinero.js';
import ProductController from '../../../src/controller/product-controller';
import Product from '../../../src/entity/product';
import User from '../../../src/entity/user';
import TokenHandler from '../../../src/authentication/token-handler';
import CreateProductRequest from '../../../src/controller/request/create-product-request';
import ProductCategory from '../../../src/entity/product-category';
import Database from '../../../src/database';
import Swagger from '../../../src/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';

describe('ProductController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: ProductController,
    token: string,
    product: CreateProductRequest,
    products: Product[],
  };

  beforeEach(async () => {
    // Initialize context
    ctx = {
      connection: await Database.initialize(),
      app: express(),
      specification: undefined,
      controller: undefined,
      token: undefined,
      product: {
        name: 'Pils',
        price: {
          currency: 'EUR',
          amount: 70,
          precision: 2,
        },
        owner: {
          id: 1,
        } as User,
        alcoholPercentage: 5.0,
        category: {
          id: 1,
          name: 'test',
        } as ProductCategory,
        picture: 'https://sudosos/image.jpg',
      },
      products: undefined,
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.token = await tokenHandler.signToken({ user: ctx.product.owner }, '1');

    await User.save({ ...ctx.product.owner } as User);
    await ProductCategory.save({ ...ctx.product.category } as ProductCategory);

    ctx.products = [
      await Product.save({
        name: 'Test-1',
        price: dinero({
          currency: 'EUR',
          amount: 70,
          precision: 2,
        }),
        owner: {
          id: 1,
        } as User,
        alcoholPercentage: 5.0,
        category: {
          id: 1,
          name: 'test',
        } as ProductCategory,
        picture: 'https://sudosos/image.jpg',
      } as any as Product),
      await Product.save({
        name: 'Test-2',
        price: dinero({
          currency: 'EUR',
          amount: 71,
          precision: 2,
        }),
        owner: {
          id: 1,
        } as User,
        alcoholPercentage: 5.0,
        category: {
          id: 1,
          name: 'test',
        } as ProductCategory,
        picture: 'https://sudosos/image2.jpg',
      } as any as Product),
    ];

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new ProductController(ctx.specification);

    ctx.app.use(bodyParser.json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/products', ctx.controller.getRouter());
  });

  afterEach(async () => {
    await ctx.connection.close();
  });

  describe('POST /products', () => {
    it('should be able to create product entity', async () => {
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.product);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when request contains other owner', async () => {
      const product = { ...ctx.product, owner: { id: 2 } as User };

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 400 when request does not contain price', async () => {
      const product = { ...ctx.product };
      delete product.price;

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request price is not default currency', async () => {
      const product = { ...ctx.product, price: { amount: 1234, currency: 'HRK' } };

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request price is not default precision', async () => {
      const product = { ...ctx.product, price: { amount: 1234, currency: 'EUR', precision: 1 } };

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request does not contain category', async () => {
      const product = { ...ctx.product };
      delete product.category;

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request category does not exist', async () => {
      const product = { ...ctx.product, category: { id: 2, name: 'non-existant' } };

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request does not contain picture', async () => {
      const product = { ...ctx.product };
      delete product.picture;

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when request does not contain alcohol percentage', async () => {
      const product = { ...ctx.product };
      delete product.alcoholPercentage;

      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(product);
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /products', () => {
    it('should be able to get all products', async () => {
      const res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send();
      const products = res.body as Product[];

      const spec = await Swagger.importSpecification();
      expect(products.length).to.equal(2);
      products.forEach((product: Product) => {
        const validation = spec.validateModel('Product', product, false, true);
        expect(validation).to.equal({ valid: true });

        const price = product.price as any as DineroObject;
        expect(product.id).to.be.greaterThan(0);
        expect(product.name).to.not.be.empty;
        expect(price.amount).to.be.greaterThan(50);
        expect(price.currency).to.equal('EUR');
      });
    });
  });
});
