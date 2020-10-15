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
import dinero from 'dinero.js';
import bodyParser from 'body-parser';
import UserController from '../../../src/controller/user-controller';
import User from '../../../src/entity/user';
import Product from '../../../src/entity/product';
import Transaction from '../../../src/entity/transaction';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database';
import Swagger from '../../../src/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import ProductCategory from '../../../src/entity/product-category';


const fakeToken = 'asempwerze723aqsbln';

describe('UserController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserController,
    token: string,
    users: Array<User>, // TODO: write create user function
    products: Array<Product>,
    transactions: Array<Transaction>,
  };

  before(async () => {
    ctx = {
      connection: await Database.initialize(),
      app: express(),
      specification: undefined,
      controller: undefined,
      token: undefined,
      users: [
        {
          id: 0,
          name: 'Roy',
        } as User,
        {
          id: 1,
          name: 'Kevin',
        } as User,
        {
          id: 2,
          name: 'Ruben',
        } as User,
      ],
      products: undefined,
      transactions: undefined,
    };

    const productCategory = {
      id: 1,
      name: 'test',
    } as ProductCategory;

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.token = await tokenHandler.signToken({ user: ctx.users[0] }, '1');

    await User.save({ ...ctx.users[0] } as User);
    await User.save({ ...ctx.users[1] } as User);
    await ProductCategory.save({ ...productCategory } as ProductCategory);

    /* ctx.products = [
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
        categoryId: 1,
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
        categoryId: 1,
        picture: 'https://sudosos/image2.jpg',
      } as any as Product),
    ]; */

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new UserController(ctx.specification);

    ctx.app.use(bodyParser.json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/users', ctx.controller.getRouter());
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /users', () => {
    it('should return all users', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal([{
        active: true,
        id: 0,
        name: 'Roy',
        createdAt: res.body[0].createdAt,
        updatedAt: res.body[0].updatedAt,
        version: 1,
      },
      {
        active: true,
        id: 1,
        name: 'Kevin',
        createdAt: res.body[1].createdAt,
        updatedAt: res.body[1].updatedAt,
        version: 1,
      }]);
    });
    it('should give an HTTP 403 when invalid token', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /users/:id', () => {
    it('should return correct user', async () => {
      const res = await request(ctx.app)
        .get('/users/0')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({
        active: true,
        id: 0,
        name: 'Roy',
        createdAt: res.body.createdAt,
        updatedAt: res.body.updatedAt,
        version: 1,
      });
    });
    it('should give an HTTP 403 when user does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/1234')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests different user', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when invalid token', async () => {
      const res = await request(ctx.app)
        .get('/users/0')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /users/:id/products', () => {
    before(async () => {
      ctx.products = [
        {
          name: 'Test-1',
          price: dinero({
            currency: 'EUR',
            amount: 70,
            precision: 2,
          }),
          category: {
            id: 1,
            name: 'test',
          } as ProductCategory,
          owner: ctx.users[0],
          alcoholPercentage: 5.0,
          picture: 'https://sudosos/image.jpg',
        } as any as Product,
        {
          name: 'Test-2',
          price: dinero({
            currency: 'EUR',
            amount: 71,
            precision: 2,
          }),
          category: {
            id: 1,
            name: 'test',
          } as ProductCategory,
          owner: ctx.users[1],
          alcoholPercentage: 5.0,
          picture: 'https://sudosos/image2.jpg',
        } as any as Product,
      ];
      console.log(ctx.products);

      await Product.save({ ...ctx.products[0] } as Product);
      await Product.save({ ...ctx.products[1] } as Product);
    });

    it('should give correct owned products for user', async () => {
      const res = await request(ctx.app)
        .get('/users/0/products')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal([{
        id: 1,
        name: 'Test-1',
        price: res.body[0].price,
        alcoholPercentage: 5.0,
        picture: 'https://sudosos/image.jpg',
        createdAt: res.body[0].createdAt,
        updatedAt: res.body[0].updatedAt,
        version: 1,
      }]);
    });
    it('should give an HTTP 403 when user requests products (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/1/products')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when invalid token', async () => {
      const res = await request(ctx.app)
        .get('/users/0/products')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /users/:id/transactions', () => {
    before(async () => {
      await User.save({ ...ctx.users[2] } as User);
      ctx.products = [
        await Product.save({
          name: 'Test-3',
          price: dinero({
            currency: 'EUR',
            amount: 70,
            precision: 2,
          }),
          category: {
            id: 1,
            name: 'test',
          } as ProductCategory,
          owner: ctx.users[0],
          alcoholPercentage: 5.0,
          picture: 'https://sudosos/image.jpg',
        } as any as Product),
      ];
      ctx.transactions = [
        await Transaction.save({
          from: ctx.users[0],
          to: ctx.users[2],
          createdBy: ctx.users[1],
          balance: dinero({
            currency: 'EUR',
            amount: 71,
            precision: 2,
          }),
          subtransactions: [{
            product: ctx.products[0],
            amount: 1,
            price: dinero({
              currency: 'EUR',
              amount: 71,
              precision: 2,
            }),
          }],
        } as any as Transaction),
        await Transaction.save({
          from: ctx.users[1],
          to: ctx.users[2],
          createdBy: ctx.users[1],
          balance: dinero({
            currency: 'EUR',
            amount: 72,
            precision: 2,
          }),
          subtransactions: [{
            product: ctx.products[0],
            amount: 1,
            price: dinero({
              currency: 'EUR',
              amount: 72,
              precision: 2,
            }),
          }],
        } as any as Transaction),
        await Transaction.save({
          from: ctx.users[1],
          to: ctx.users[2],
          createdBy: ctx.users[0],
          balance: dinero({
            currency: 'EUR',
            amount: 73,
            precision: 2,
          }),
          subtransactions: [{
            product: ctx.products[0],
            amount: 1,
            price: dinero({
              currency: 'EUR',
              amount: 73,
              precision: 2,
            }),
          }],
        } as any as Transaction),
        await Transaction.save({
          from: ctx.users[0],
          to: ctx.users[2],
          createdBy: ctx.users[0],
          balance: dinero({
            currency: 'EUR',
            amount: 74,
            precision: 2,
          }),
          subtransactions: [{
            product: ctx.products[0],
            amount: 1,
            price: dinero({
              currency: 'EUR',
              amount: 74,
              precision: 2,
            }),
          }],
        } as any as Transaction),
        await Transaction.save({
          from: ctx.users[1],
          to: ctx.users[0],
          createdBy: ctx.users[1],
          balance: dinero({
            currency: 'EUR',
            amount: 75,
            precision: 2,
          }),
          subtransactions: [{
            product: ctx.products[0],
            amount: 1,
            price: dinero({
              currency: 'EUR',
              amount: 75,
              precision: 2,
            }),
          }],
        } as any as Transaction),
        await Transaction.save({
          from: ctx.users[2],
          to: ctx.users[1],
          createdBy: ctx.users[1],
          balance: dinero({
            currency: 'EUR',
            amount: 76,
            precision: 2,
          }),
          subtransactions: [{
            product: ctx.products[0],
            amount: 1,
            price: dinero({
              currency: 'EUR',
              amount: 76,
              precision: 2,
            }),
          }],
        } as any as Transaction),
      ];
    });

    it('should give correct transactions from/to user', async () => {
      const res = await request(ctx.app)
        .get('/users/0/transactions')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal([
        {
          balance: {
            amount: 71,
            currency: 'EUR',
            precision: 2,
          },
          createdAt: res.body[0].createdAt,
          id: 1,
          updatedAt: res.body[0].updatedAt,
          version: 1,
        },
        {
          balance: {
            amount: 73,
            currency: 'EUR',
            precision: 2,
          },
          createdAt: res.body[1].createdAt,
          id: 3,
          updatedAt: res.body[1].updatedAt,
          version: 1,
        },
        {
          balance: {
            amount: 74,
            currency: 'EUR',
            precision: 2,
          },
          createdAt: res.body[2].createdAt,
          id: 4,
          updatedAt: res.body[2].updatedAt,
          version: 1,
        },
        {
          balance: {
            amount: 75,
            currency: 'EUR',
            precision: 2,
          },
          createdAt: res.body[3].createdAt,
          id: 5,
          updatedAt: res.body[3].updatedAt,
          version: 1,
        },
      ]);
    });
    it('should give an HTTP 403 when user requests transactions from someone else', async () => {
      const res = await request(ctx.app)
        .get('/users/1/transactions')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when invalid token', async () => {
      const res = await request(ctx.app)
        .get('/users/0/products')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).to.equal(403);
    });
  });
});
