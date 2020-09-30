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
import User from '../../../src/entity/user';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database';
import Swagger from '../../../src/swagger';
import TokenMiddleware from '../../../src/middleware/token-middleware';

const fakeToken = 'asempwerze723aqsbln';

describe('UserController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserController,
    token: string,
    users: Array<User> // TODO: write create user function
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
        } as User,
        {
          id: 1,
        } as User,
      ],
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    ctx.token = await tokenHandler.signToken({ user: ctx.users[0] }, '1');

    await User.save({ ...ctx.users[0] } as User);
    await User.save({ ...ctx.users[1] } as User);

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
        id: 0,
        createdAt: res.body[0].createdAt,
        updatedAt: res.body[0].updatedAt,
        version: 1,
      },
      {
        id: 1,
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
        id: 0,
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
});
