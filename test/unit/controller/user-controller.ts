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
import UserController from '../../../src/controller/user-controller';
import User, { UserType } from '../../../src/entity/user/user';
import Product from '../../../src/entity/product/product';
import Transaction from '../../../src/entity/transactions/transaction';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import ProductCategory from '../../../src/entity/product/product-category';
import Container from '../../../src/entity/container/container';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import seedDatabase from '../../seed';
import { verifyUserEntity } from '../validators';
import RoleManager from '../../../src/rbac/role-manager';

describe('UserController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserController,
    userToken: string,
    adminToken: string,
    user: User,
    users: User[],
    categories: ProductCategory[],
    products: Product[],
    productRevisions: ProductRevision[],
    containers: Container[],
    containerRevisions: ContainerRevision[],
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
  };

  before(async () : Promise<void> => {
    const connection = await Database.initialize();
    const app = express();
    const database = await seedDatabase();
    ctx = {
      connection,
      app,
      specification: undefined,
      controller: undefined,
      userToken: undefined,
      adminToken: undefined,
      user: {
        firstName: 'Roy',
        lastName: 'Kakkenberg',
        type: UserType.MEMBER,
      } as any as User,
      ...database,
    };

    ctx.users.push({
      firstName: 'Kevin',
      lastName: 'Jilessen',
      type: UserType.MEMBER,
      deleted: true,
      active: true,
    } as any as User);

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.userToken = await tokenHandler.signToken({ user: ctx.users[0], roles: ['User'] }, '1');
    ctx.adminToken = await tokenHandler.signToken({ user: ctx.users[6], roles: ['User', 'Admin'] }, '1');

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        User: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
        Product: {
          get: all,
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });
    roleManager.registerRole({
      name: 'User',
      permissions: {
        User: {
          get: own,
        },
        Product: {
          get: own,
          update: own,
        },
      },
      assignmentCheck: async () => true,
    });

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new UserController({
      specification: ctx.specification,
      roleManager,
    });

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
      expect(users.length).to.equal(24);
      users.forEach((user: User) => {
        verifyUserEntity(spec, user);
      });
    });
    it('should give an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /users/:id', () => {
    it('should return correct user (myself)', async () => {
      const res = await request(ctx.app)
        .get('/users/1')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });
    it('should give an HTTP 403 when requesting different user', async () => {
      const res = await request(ctx.app)
        .get('/users/2')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when requesting different user that does not exist', async () => {
      const res = await request(ctx.app)
        .get('/users/1234')
        .set('Authorization', `Bearer ${ctx.userToken}`);
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
    it('should give an HTTP 404 when admin requests deleted user', async () => {
      const res = await request(ctx.app)
        .get('/users/25')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /users', () => {
    it('should give an HTTP 403 when not an admin', async () => {
      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.user);
      expect(res.status).to.equal(403);
    });

    it('should give HTTP 200 when correctly creating user', async () => {
      const res = await request(ctx.app)
        .post('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.user);
      expect(res.status).to.equal(201);

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
      expect(res.status).to.equal(201);

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
      expect(res.status).to.equal(201);

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
      expect(res.status).to.equal(201);

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
      expect(res.status).to.equal(201);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      verifyUserEntity(spec, user);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should give HTTP 403 when user is not an admin', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ firstName: 'Ralf' });
      expect(res.status).to.equal(403);
    });
    it('should correctly change firstName if requester is admin', async () => {
      const firstName = 'Ralf';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ firstName });
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      expect(user.firstName).to.deep.equal(firstName);
      verifyUserEntity(spec, user);
    });
    it('should give HTTP 400 if firstName is emtpy', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ firstName: '' });
      expect(res.status).to.equal(400);
    });
    it('should give HTTP 400 if firstName is too long', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ firstName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' });
      expect(res.status).to.equal(400);
    });
    it('should correctly change lastName if requester is admin', async () => {
      const lastName = 'Eemers';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName });
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      expect(user.lastName).to.deep.equal(lastName);
      verifyUserEntity(spec, user);
    });
    it('should correctly change lastName to empty string if requester is admin', async () => {
      const lastName = '';

      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName });
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      expect(user.lastName).to.deep.equal(lastName);
      verifyUserEntity(spec, user);
    });
    it('should give HTTP 400 if firstName is too long', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ lastName: 'ThisIsAStringThatIsMuchTooLongToFitInASixtyFourCharacterStringBox' });
      expect(res.status).to.equal(400);
    });
    it('should correctly set user inactive if requester is admin', async () => {
      const active = false;

      const res = await request(ctx.app)
        .patch('/users/13')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ active });
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      expect(user.active).to.deep.equal(active);
      verifyUserEntity(spec, user);
    });
    it('should correctly set user active if requester is admin', async () => {
      const active = true;

      const res = await request(ctx.app)
        .patch('/users/12')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ active });
      expect(res.status).to.equal(200);

      const user = res.body as User;
      const spec = await Swagger.importSpecification();
      expect(user.active).to.deep.equal(active);
      verifyUserEntity(spec, user);
    });
    it('should give HTTP 400 if active is undefined', async () => {
      const res = await request(ctx.app)
        .patch('/users/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ active: undefined });
      expect(res.status).to.equal(400);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should give HTTP 403 when user is not an admin', async () => {
      const res = await request(ctx.app)
        .delete('/users/24')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should correctly delete user if requester is admin', async () => {
      let res = await request(ctx.app)
        .delete('/users/24')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);

      // User does not exist anymore
      res = await request(ctx.app)
        .get('/users/24')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });

    it('should give HTTP 404 if admin and user does not exist', async () => {
      const res = await request(ctx.app)
        .delete('/users/1234')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });

    it('should give HTTP 400 if admin requests to delete itself', async () => {
      const res = await request(ctx.app)
        .delete('/users/7')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });

    it('should give HTTP 404 if trying to delete user twice', async () => {
      const res = await request(ctx.app)
        .delete('/users/4')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);

      const res2 = await request(ctx.app)
        .delete('/users/4')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res2.status).to.equal(404);
    });
  });

  describe('GET /users/:id/products', () => {
    it('should give correct owned products for user', async () => {
      const res = await request(ctx.app)
        .get('/users/1/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);

      // TODO: test response validity
    });
    it('should give an HTTP 403 when user requests products (s)he does not own', async () => {
      const res = await request(ctx.app)
        .get('/users/2/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user requests products from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/products')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give correct owned products for admin', async () => {
      const res = await request(ctx.app)
        .get('/users/2/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      // TODO: test response validity
    });
    it('should give an HTTP 404 when admin requests products from unknown user', async () => {
      const res = await request(ctx.app)
        .get('/users/1234/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

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
  //   it('should give correct transactions from/to user', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/0/transactions')
  //       .set('Authorization', `Bearer ${ctx.adminToken}`);
  //     expect(res.status).to.equal(200);
  //     expect(res.body).to.deep.equal([]);
  //   });
  //   it('should give an HTTP 403 when user requests transactions from someone else', async () => {
  //     const res = await request(ctx.app)
  //       .get('/users/1/transactions')
  //       .set('Authorization', `Bearer ${ctx.adminToken}`);
  //     expect(res.status).to.equal(403);
  //   });
  //   it(
  //     'should give an HTTP 404 when admin requests transactions from unknown user',
  //     async () => {
  //       const res = await request(ctx.app)
  //         .get('/users/1234/transactions')
  //         .set('Authorization', `Bearer ${ctx.adminToken}`);
  //       expect(res.status).to.equal(404);
  //     },
  //   );
  // });
  // TODO: Check validity of returned transactions
});
