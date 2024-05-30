/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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

import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import TokenHandler from '../../../src/authentication/token-handler';
import AuthenticationSecureController from '../../../src/controller/authentication-secure-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';

describe('AuthenticationSecureController', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    specification: SwaggerSpecification,
    controller: AuthenticationSecureController,
    user: User,
    token: string;
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const user = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const token = await tokenHandler.signToken({ user, roles: [], lesser: false }, 'nonce');

    const roleManager = new RoleManager();

    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new AuthenticationSecureController(
      { specification, roleManager }, tokenHandler,
    );
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/authentication', controller.getRouter());

    ctx = {
      connection,
      app,
      tokenHandler,
      specification,
      controller,
      user,
      token,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /authentication/refreshToken', () => {
    it('should return new token', async () => {
      const res = await request(ctx.app)
        .get('/authentication/refreshToken')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
  });
});
