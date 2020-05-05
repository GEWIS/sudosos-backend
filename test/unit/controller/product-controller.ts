import express, { Application } from 'express';
import { expect, request } from 'chai';
import dinero from 'dinero.js';
import ProductController from '../../../src/controller/product-controller';
import Product from '../../../src/entity/product';

describe('ProductController', (): void => {
  let ctx: {
    app: Application,
    controller: ProductController,
    product: Product,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      controller: new ProductController(),
      product: undefined,
    };

    ctx.app.use('/products', ctx.controller.getRouter());
  });

  describe('POST /products', () => {
    it('should be able to create product entity', async () => {
      const res = await request(ctx.app)
        .post('/products')
        .send(ctx.product);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 401 when request contains other owner', async () => {
      const product = { ...ctx.product };
      delete product.owner;

      const res = await request(ctx.app)
        .post('/products')
        .send(product);
      expect(res.status).to.equal(400);
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
