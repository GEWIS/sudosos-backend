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
import log4js from 'log4js';
import User, { UserType } from '../../../src/entity/user/user';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import AuthenticationController from '../../../src/controller/authentication-controller';
import AuthenticationMockRequest from '../../../src/controller/request/authentication-mock-request';
import RoleManager from '../../../src/rbac/role-manager';

describe('AuthenticationController', async (): Promise<void> => {
  let ctx: {
    env: string,
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    specification: SwaggerSpecification,
    controller: AuthenticationController,
    user: User,
    user2: User,
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
      roleManager: new RoleManager(),
      user: await User.save({
        firstName: 'Roy',
        type: UserType.LOCAL_USER,
        active: true,
      } as User),
      user2: await User.save({
        firstName: 'Roy Clone',
        type: UserType.LOCAL_ADMIN,
        active: true,
      } as User),
      request: {
        userId: 1,
        nonce: 'test',
      },
    };
    process.env.NODE_ENV = 'development';

    ctx.roleManager.registerRole({
      name: 'Role',
      permissions: {},
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    // Silent in-dependency logs unless really wanted by the environment.
    const logger = log4js.getLogger('Console');
    logger.level = process.env.LOG_LEVEL;
    console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new AuthenticationController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler);

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

      const promise = ctx.tokenHandler.verifyToken(res.body);
      expect(promise).to.eventually.be.fulfilled;

      const token = await promise;
      expect(token.roles).to.be.empty;
    });
    it('should contain the correct roles', async () => {
      let res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(200);
      let token = await ctx.tokenHandler.verifyToken(res.body);
      expect(token.roles).to.be.empty;

      const req = {
        ...ctx.request,
        userId: 2,
      };
      res = await request(ctx.app)
        .post('/authentication/mock')
        .send(req);
      expect(res.status).to.equal(200);
      token = await ctx.tokenHandler.verifyToken(res.body);
      expect(token.roles).to.deep.equal(['Role']);
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
