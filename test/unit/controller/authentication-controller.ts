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
import User from '../../../src/entity/user';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database';
import Swagger from '../../../src/swagger';
import AuthenticationController from '../../../src/controller/authentication-controller';
import AuthenticationMockRequest from '../../../src/controller/request/authentication-mock-request';

describe('AuthenticationController', async (): Promise<void> => {
  let ctx: {
    env: string,
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    specification: SwaggerSpecification,
    controller: AuthenticationController,
    user: User,
    request: AuthenticationMockRequest,
  };

  beforeEach(async () => {
    // Initialize context
    ctx = {
      env: process.env.NODE_ENV,
      connection: await Database.initialize(),
      app: express(),
      specification: undefined,
      controller: undefined,
      tokenHandler: new TokenHandler({
        algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
      }),
      user: await User.save({} as User),
      request: {
        userId: 1,
        nonce: 'test',
      },
    };
    process.env.NODE_ENV = 'development';

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new AuthenticationController(ctx.specification, ctx.tokenHandler);

    ctx.app.use(bodyParser.json());
    ctx.app.use('/authentication', ctx.controller.getRouter());
  });

  afterEach(async () => {
    process.env.NODE_ENV = ctx.env;
    await ctx.connection.close();
  });

  describe('POST /authentication/mock', () => {
    it('should be able to create token', async () => {
      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(200);
      expect(ctx.tokenHandler.verifyToken(res.body)).to.eventually.be.fulfilled;
    });
    it('should give an HTTP 403 when not in development environment', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user does not exist', async () => {
      const req = { ...ctx.request, userId: 10 };

      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(req);
      expect(res.status).to.equal(403);
    });
  });
});
