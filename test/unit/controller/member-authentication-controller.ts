/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

import express, { Application } from 'express';
import chai from 'chai';

import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import { json } from 'body-parser';
import log4js from 'log4js';
import User, { UserType } from '../../../src/entity/user/user';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import AuthenticationResponse from '../../../src/controller/response/authentication-response';
import MemberAuthenticationController from '../../../src/controller/member-authentication-controller';
import MemberUser from '../../../src/entity/user/member-user';
import MemberAuthenticationPinRequest from '../../../src/controller/request/member-authentication-pin-request';
import AuthenticationService from '../../../src/service/authentication-service';
import PinAuthenticator from '../../../src/entity/authenticator/pin-authenticator';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { ensureProductionRoles } from '../../helpers/user-factory';

const { expect, request } = chai;

describe('MemberAuthenticationController', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    specification: SwaggerSpecification,
    controller: MemberAuthenticationController,
    user: User,
    memberUser1: MemberUser,
  };

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const user = await User.save({
      firstName: 'Roy',
      type: UserType.MEMBER,
      active: true,
    } as User);

    const memberUser1 = await MemberUser.save({
      user,
      memberId: 11,
    } as MemberUser);

    await new AuthenticationService().setUserAuthenticationHash(
      await User.findOne({ where: { id: user.id } }), '1000', PinAuthenticator,
    );

    await ensureProductionRoles();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const roleManager = await new RoleManager().initialize();

    // Silent in-dependency logs unless really wanted by the environment.
    const logger = log4js.getLogger('Console');
    logger.level = process.env.LOG_LEVEL;
    console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new MemberAuthenticationController({
      specification,
      roleManager,
    }, tokenHandler);

    app.use(json());
    app.use('/authentication', controller.getRouter());

    ctx = {
      connection,
      app,
      tokenHandler,
      roleManager,
      specification,
      controller,
      user,
      memberUser1,
    };
  });

  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('POST /authentication/member/pin', () => {
    const validPinRequest: MemberAuthenticationPinRequest = {
      memberId: 11,
      pin: '1000',
    };
    it('should return an HTTP 200 and User if correct pin code', async () => {
      const res = await request(ctx.app)
        .post('/authentication/member/pin')
        .send(validPinRequest);
      expect((res.body as AuthenticationResponse).user.id).to.be.equal(ctx.user.id);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if incorrect pin code', async () => {
      const res = await request(ctx.app)
        .post('/authentication/member/pin')
        .send({ ...validPinRequest, pin: '9999' });
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 403 if user is not registered', async () => {
      const res = await request(ctx.app)
        .post('/authentication/member/pin')
        .send({ ...validPinRequest, memberId: 99999 } as MemberAuthenticationPinRequest);
      expect(res.status).to.equal(403);
    });
  });
});
