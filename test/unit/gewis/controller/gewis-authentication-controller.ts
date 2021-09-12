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
import { json } from 'body-parser';
import * as jwt from 'jsonwebtoken';
import log4js from 'log4js';
import User, { UserType } from '../../../../src/entity/user/user';
import TokenHandler from '../../../../src/authentication/token-handler';
import Database from '../../../../src/database/database';
import Swagger from '../../../../src/start/swagger';
import RoleManager from '../../../../src/rbac/role-manager';
import AuthenticationResponse from '../../../../src/controller/response/authentication-response';
import GewisAuthenticationController from '../../../../src/gewis/controller/gewis-authentication-controller';
import GewiswebToken from '../../../../src/gewis/gewisweb-token';
import GewisUser from '../../../../src/entity/user/gewis-user';

describe('GewisAuthenticationController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    specification: SwaggerSpecification,
    controller: GewisAuthenticationController,
    user: User,
    user2: User,
    gewisUser1: GewisUser,
    gewisUser2: GewisUser,
    secret: string,
  };

  before(async () => {
    // Initialize context
    ctx = {
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
      gewisUser1: await GewisUser.save({
        user: {
          id: 1,
        } as User,
        gewisId: 11,
      } as GewisUser),
      gewisUser2: await GewisUser.save({
        user: {
          id: 2,
        } as User,
        gewisId: 12,
      } as GewisUser),
      secret: '42',
    };

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
    ctx.controller = new GewisAuthenticationController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler, ctx.secret);

    ctx.app.use(json());
    ctx.app.use('/authentication', ctx.controller.getRouter());
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('POST /authentication/gewisweb', () => {
    it('should be able to create token', async () => {
      const req = {
        token: jwt.sign({ lidnr: ctx.gewisUser1.gewisId } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      const res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const auth = res.body as AuthenticationResponse;
      const promise = ctx.tokenHandler.verifyToken(auth.token);
      expect(promise).to.eventually.be.fulfilled;

      const token = await promise;
      expect(token.roles).to.be.empty;
    });
    it('should contain the correct roles', async () => {
      let req = {
        token: jwt.sign({ lidnr: ctx.gewisUser1.gewisId } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      let res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(200);

      let auth = res.body as AuthenticationResponse;
      let token = await ctx.tokenHandler.verifyToken(auth.token);
      expect(token.roles).to.be.empty;

      req = {
        token: jwt.sign({ lidnr: ctx.gewisUser2.gewisId } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(200);

      auth = res.body as AuthenticationResponse;
      token = await ctx.tokenHandler.verifyToken(auth.token);
      expect(token.roles).to.deep.equal(['Role']);
    });
    it('should give an HTTP 403 when user does not exist', async () => {
      const req = {
        token: jwt.sign({ lidnr: ctx.gewisUser2.gewisId + 1 } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      const res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 with invalid JWT signature', async () => {
      const req = {
        token: jwt.sign({ lidnr: ctx.gewisUser2.gewisId } as GewiswebToken, 'Imposter', {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      const res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(403);
    });
  });
});
