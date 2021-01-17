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
// import dinero from 'dinero.js';
import bodyParser from 'body-parser';
import UserController from '../../../src/controller/user-controller';
// eslint-disable-next-line import/no-duplicates
import User from '../../../src/entity/user/user';
// eslint-disable-next-line import/no-duplicates
import { UserType } from '../../../src/entity/user/user';
import Product from '../../../src/entity/product/product';
import Transaction from '../../../src/entity/transactions/transaction';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database';
import Swagger from '../../../src/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import ProductCategory from '../../../src/entity/product/product-category';
import Container from '../../../src/entity/container/container';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
// import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
// import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';

function verifyUserEntity(spec: SwaggerSpecification, user: User): void {
  const validation = spec.validateModel('User', user, false, true);
  expect(validation.valid).to.be.true;

  expect(user.id).to.be.greaterThan(-1);
  expect(user.firstName).to.not.be.empty;
  expect(user.active).to.not.be.null;
  expect(user.deleted).to.be.false;
  expect(Object.values(UserType)).to.include(user.type);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function verifyProductEntity(spec: SwaggerSpecification, product: ProductRevision): void {
  const validation = spec.validateModel('Product', product, false, true);
  expect(validation.valid).to.be.true;

  expect(product.product.id).to.be.greaterThan(-1);
  expect(product.name).to.not.be.empty;
  expect(product.price.getAmount()).to.be.greaterThan(50);
  expect(product.price.getCurrency()).to.equal('EUR');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function verifyContainerEntity(spec: SwaggerSpecification, container: ContainerRevision): void {
  const validation = spec.validateModel('Container', container, false, true);
  expect(validation.valid).to.be.true;

  expect(container.container.id).to.be.greaterThan(-1);
  expect(container.name).to.be.not.empty;
  expect(container.container.owner).to.be.instanceOf(User);
  expect(container.products).to.be.instanceOf(Array);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function verifyPOSEntity(spec: SwaggerSpecification, pointOfSale: PointOfSaleRevision): void {
  const validation = spec.validateModel('PointOfSale', pointOfSale, false, true);
  expect(validation.valid).to.be.true;

  expect(pointOfSale.pointOfSale.id).to.be.greaterThan(-1);
  expect(pointOfSale.name).to.be.not.empty;
  expect(pointOfSale.pointOfSale.owner).to.be.instanceOf(User);
  expect(pointOfSale.startDate).to.be.instanceOf(Date);
  expect(pointOfSale.endDate).to.be.instanceOf(Date);
  expect(pointOfSale.endDate.getTime()).to.be.greaterThan(pointOfSale.startDate.getTime());
  expect(pointOfSale.containers).to.be.instanceOf(Array);
}

describe('UserController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserController,
    token: string,
    adminToken: string,
    user: User,
    users: Array<User>,
    products: Array<Product>,
    containers: Array<Container>,
    pointOfSales: Array<PointOfSale>,
    transactions: Array<Transaction>,
  };

  before(async () => {
    ctx = {
      connection: await Database.initialize(),
      app: express(),
      specification: undefined,
      controller: undefined,
      token: undefined,
      adminToken: undefined,
      user: {
        firstName: 'Rick',
        lastName: 'Wouters',
        type: UserType.MEMBER,
      } as any as User,
      users: [
        {
          id: 0,
          firstName: 'Roy',
          type: UserType.LOCAL_USER,
          active: true,
        } as any as User,
        {
          id: 1,
          firstName: 'Kevin',
          type: UserType.MEMBER,
        } as any as User,
        {
          id: 2,
          firstName: 'Ruben',
          type: UserType.LOCAL_ADMIN,
        } as any as User,
        {
          id: 3,
          firstName: 'Wout',
          type: UserType.LOCAL_USER,
          deleted: true,
        } as any as User,
      ],
      products: undefined,
      containers: undefined,
      pointOfSales: undefined,
      // products: [
      //   {
      //     name: 'Test-1',
      //     price: dinero({
      //       currency: 'EUR',
      //       amount: 70,
      //       precision: 2,
      //     }),
      //     category: {
      //       id: 1,
      //       name: 'test',
      //     } as ProductCategory,
      //     owner: ctx.users[0],
      //     alcoholPercentage: 5.0,
      //     picture: 'https://sudosos/image.jpg',
      //   } as Product,
      //   {
      //     name: 'Test-2',
      //     price: dinero({
      //       currency: 'EUR',
      //       amount: 71,
      //       precision: 2,
      //     }),
      //     category: {
      //       id: 1,
      //       name: 'test',
      //     } as ProductCategory,
      //     owner: ctx.users[1],
      //     alcoholPercentage: 5.0,
      //     picture: 'https://sudosos/image2.jpg',
      //   } as Product,
      // ],
      // containers: [
      //   {
      //     name: 'container420',
      //     owner: ctx.users[0],
      //     products: [ctx.products[0]],
      //   } as Container,
      //   {
      //     name: 'container69',
      //     owner: ctx.users[1],
      //     products: [ctx.products[1], ctx.products[0]],
      //   } as Container,
      // ],
      // pointOfSales: [
      //   {
      //     name: 'pos1',
      //     owner: ctx.users[0],
      //     startDate: new Date(),
      //     endDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 24),
      //     useAuthentication: false,
      //     containers: [ctx.containers[1]],
      //   } as PointOfSale,
      //   {
      //     name: 'pos69',
      //     owner: ctx.users[1],
      //     startDate: new Date(),
      //     endDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 24),
      //     useAuthentication: false,
      //     containers: [ctx.containers[1], ctx.containers[0]],
      //   } as PointOfSale,
      // ],
      transactions: undefined,
    };

    // const productCategory = {
    //   id: 1,
    //   name: 'test',
    // } as ProductCategory;

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.token = await tokenHandler.signToken({ user: ctx.users[0] }, '1');
    ctx.adminToken = await tokenHandler.signToken({ user: ctx.users[2] }, '1');

    await User.save({ ...ctx.users[0] } as User);
    await User.save({ ...ctx.users[1] } as User);
    await User.save({ ...ctx.users[2] } as User);
    // await ProductCategory.save({ ...productCategory } as ProductCategory);
    // await Product.save({ ...ctx.products[0] } as Product);
    // await Product.save({ ...ctx.products[1] } as Product);

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
    it('should return all users if admin', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const users = res.body as User[];
      const spec = await Swagger.importSpecification();
      expect(users.length).to.equal(3);
      users.forEach((user: User) => {
        verifyUserEntity(spec, user);
      });
    });
    it('should give an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /users/:id', () => {
    it('should return correct user (myself)', async () => {
      const res = await request(ctx.app)
        .get('/users/0')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });
    it('should give an HTTP 403 when requesting different user', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when requesting different user that does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/1234')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
    it('should return correct user when admin requests different user', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });
    it('should give an HTTP 404 when admin requests different user that does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/1234')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /users', () => {
    it('should give an HTTP 403 when not an admin', async () => {
      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.user);
      expect(res.status).to.equal(403);
    });

    it('should give HTTP 200 when correctly creating user', async () => {
      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.user);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });

    it('should create user without lastName', async () => {
      const userObj = { ...ctx.user };
      delete userObj.lastName;

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });

    it('should create user with empty lastName', async () => {
      const userObj = { ...ctx.user, lastName: '' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });

    it('should give HTTP 400 when too long lastName', async () => {
      const userObj = { ...ctx.user, lastName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when no firstName', async () => {
      const userObj = { ...ctx.user };
      delete userObj.firstName;

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when empty firstName', async () => {
      const userObj = { ...ctx.user, firstName: '' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when too long firstName', async () => {
      const userObj = { ...ctx.user, firstName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when non-existing UserType', async () => {
      const userObj = { ...ctx.user, type: 6969420 };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 400 when new user is already deleted', async () => {
      const userObj = { ...ctx.user, deleted: true };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(400);
    });

    it('should create user when active is true', async () => {
      const userObj = { ...ctx.user, active: true };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });

    it('should create user when active is false', async () => {
      const userObj = { ...ctx.user, active: false };

      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(userObj);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });
  });

  // describe('GET /users/:id/products', () => {
  //   it('should give correct owned products for user', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/0/products')
  //       .set('Authorization', `Bearer ${ctx.token}`);
  //     expect(res.status).to.equal(200);
  //     expect(res.body).to.deep.equal([]);
  //   });
  //   it('should give an HTTP 403 when user requests products (s)he does not own', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/1/products')
  //       .set('Authorization', `Bearer ${ctx.token}`);
  //     expect(res.status).to.equal(403);
  //   });
  // });
  //
  // describe('GET /users/:id/containers', () => {
  //   it('should give correct owned containers for user', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/0/containers')
  //       .set('Authorization', `Bearer ${ctx.token}`);
  //     expect(res.status).to.equal(200);
  //     expect(res.body).to.deep.equal([]);
  //   });
  //   it('should give an HTTP 403 when user requests containers (s)he does not own', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/1/containers')
  //       .set('Authorization', `Bearer ${ctx.token}`);
  //     expect(res.status).to.equal(403);
  //   });
  // });
  //
  // describe('GET /users/:id/transactions', () => {
  //   before(async () => {
  //     ctx.transactions = [
  //       await Transaction.save({
  //         from: ctx.users[0],
  //         createdBy: ctx.users[1],
  //         pointOfSale: ctx.pointOfSales[0],
  //         subTransactions: [{
  //           to: ctx.users[2],
  //           container: ctx.containers[0],
  //           subTransactionRows: [{
  //             product: ctx.products[0],
  //             amount: 1,
  //           } as SubTransactionRow],
  //         } as SubTransaction],
  //       } as any as Transaction),
  //       await Transaction.save({
  //         from: ctx.users[1],
  //         pointOfSale: ctx.pointOfSales[0],
  //         subTransactions: [{
  //           to: ctx.users[2],
  //           container: ctx.containers[0],
  //           subTransactionRows: [{
  //             product: ctx.products[0],
  //             amount: 1,
  //           } as SubTransactionRow],
  //         } as SubTransaction],
  //       } as any as Transaction),
  //       await Transaction.save({
  //         from: ctx.users[0],
  //         pointOfSale: ctx.pointOfSales[0],
  //         subTransactions: [{
  //           to: ctx.users[1],
  //           container: ctx.containers[0],
  //           subTransactionRows: [{
  //             product: ctx.products[0],
  //             amount: 1,
  //           } as SubTransactionRow],
  //         } as SubTransaction],
  //       } as any as Transaction),
  //       await Transaction.save({
  //         from: ctx.users[2],
  //         createdBy: ctx.users[1],
  //         pointOfSale: ctx.pointOfSales[0],
  //         subTransactions: [{
  //           to: ctx.users[0],
  //           container: ctx.containers[0],
  //           subTransactionRows: [{
  //             product: ctx.products[0],
  //             amount: 1,
  //           } as SubTransactionRow],
  //         } as SubTransaction],
  //       } as any as Transaction),
  //       await Transaction.save({
  //         from: ctx.users[1],
  //         createdBy: ctx.users[0],
  //         pointOfSale: ctx.pointOfSales[0],
  //         subTransactions: [{
  //           to: ctx.users[2],
  //           container: ctx.containers[0],
  //           subTransactionRows: [{
  //             product: ctx.products[0],
  //             amount: 1,
  //           } as SubTransactionRow],
  //         } as SubTransaction],
  //       } as any as Transaction),
  //     ];
  //   });
  //
  //   it('should give correct transactions from/to user', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/0/transactions')
  //       .set('Authorization', `Bearer ${ctx.token}`);
  //     expect(res.status).to.equal(200);
  //     expect(res.body).to.deep.equal([]);
  //   });
  //   it('should give an HTTP 403 when user requests transactions from someone else', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/1/transactions')
  //       .set('Authorization', `Bearer ${ctx.token}`);
  //     expect(res.status).to.equal(403);
  //   });
  // });
});
