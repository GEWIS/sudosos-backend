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
 *
 *  @license
 */

import express, { Application } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import { json } from 'body-parser';
import log4js from 'log4js';
import User, { UserType } from '../../../../src/entity/user/user';
import TokenHandler from '../../../../src/authentication/token-handler';
import Database from '../../../../src/database/database';
import Swagger from '../../../../src/start/swagger';
import RoleManager from '../../../../src/rbac/role-manager';
import AuthenticationResponse from '../../../../src/controller/response/authentication-response';
import GewisAuthenticationSecureController from '../../../../src/gewis/controller/gewis-authentication-secure-controller';
import GewisUser from '../../../../src/gewis/entity/gewis-user';
import AuthenticationService from '../../../../src/service/authentication-service';
import GEWISAuthenticationSecurePinRequest from '../../../../src/gewis/controller/request/gewis-authentication-secure-pin-request';
import PinAuthenticator from '../../../../src/entity/authenticator/pin-authenticator';
import PointOfSale from '../../../../src/entity/point-of-sale/point-of-sale';
import { truncateAllTables } from '../../../setup';
import { finishTestDB } from '../../../helpers/test-helpers';
import { RbacSeeder, PointOfSaleSeeder } from '../../../seed';
import TokenMiddleware from '../../../../src/middleware/token-middleware';
import DefaultRoles from '../../../../src/rbac/default-roles';
import ServerSettingsStore from '../../../../src/server-settings/server-settings-store';
import { TermsOfServiceStatus } from '../../../../src/entity/user/user';

describe('GewisAuthenticationSecureController', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    specification: SwaggerSpecification,
    controller: GewisAuthenticationSecureController,
    memberUser: User,
    posUser: User,
    gewisUser: GewisUser,
    pointOfSale: PointOfSale,
    posUserToken: string,
    memberUserToken: string,
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    await ServerSettingsStore.getInstance().initialize();
    await DefaultRoles.synchronize();

    // Create users
    const memberUser = await User.save({
      firstName: 'Member',
      lastName: 'User',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);

    // Create GEWIS user linked to member user
    const gewisUser = await GewisUser.save({
      user: memberUser,
      gewisId: 12345,
    } as GewisUser);

    // Set up PIN authenticator for the member user
    await new AuthenticationService().setUserAuthenticationHash(memberUser, '1234', PinAuthenticator);

    // Create POS user and point of sale
    const { pointsOfSale, pointOfSaleUsers } = await new PointOfSaleSeeder().seed([memberUser]);
    const posUser = pointOfSaleUsers[0];
    const pointOfSale = pointsOfSale[0];

    // Create tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const roleManager = await new RoleManager().initialize();
    const rbacSeeder = new RbacSeeder();
    const posUserToken = await tokenHandler.signToken(
      await rbacSeeder.getToken(posUser),
      'nonce',
    );
    const memberUserToken = await tokenHandler.signToken(
      await rbacSeeder.getToken(memberUser),
      'nonce',
    );

    // Initialize app
    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new GewisAuthenticationSecureController(
      { specification, roleManager },
      tokenHandler,
    );

    // Silent in-dependency logs unless really wanted by the environment.
    const logger = log4js.getLogger('Console');
    logger.level = process.env.LOG_LEVEL;
    console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/authentication', controller.getRouter());

    ctx = {
      connection,
      app,
      tokenHandler,
      roleManager,
      specification,
      controller,
      memberUser,
      posUser,
      gewisUser,
      pointOfSale,
      posUserToken,
      memberUserToken,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('POST /authentication/GEWIS/pin-secure', () => {
    const validSecurePinRequest: GEWISAuthenticationSecurePinRequest = {
      gewisId: 12345,
      pin: '1234',
      posId: 0, // Will be set to actual POS ID in tests
    };

    it('should return HTTP 200 and token when valid POS user authenticates with correct PIN', async () => {
      const requestBody = {
        ...validSecurePinRequest,
        posId: ctx.pointOfSale.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin-secure')
        .set('Authorization', `Bearer ${ctx.posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const auth = res.body as AuthenticationResponse;
      expect(auth.user.id).to.equal(ctx.memberUser.id);
      expect(auth.token).to.be.a('string');

      // Verify the token contains posId
      const decoded = await ctx.tokenHandler.verifyToken(auth.token);
      expect(decoded.posId).to.equal(ctx.pointOfSale.id);
    });

    it('should return HTTP 403 when caller is not a POS user', async () => {
      const requestBody = {
        ...validSecurePinRequest,
        posId: ctx.pointOfSale.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin-secure')
        .set('Authorization', `Bearer ${ctx.memberUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body).to.equal('Only POS users can use secure GEWIS PIN authentication.');
    });

    it('should return HTTP 403 when POS user ID does not match requested posId', async () => {
      const requestBody = {
        ...validSecurePinRequest,
        posId: ctx.pointOfSale.id + 999, // Wrong POS ID
      };

      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin-secure')
        .set('Authorization', `Bearer ${ctx.posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body).to.equal('POS user ID does not match the requested posId.');
    });

    it('should return HTTP 403 when GEWIS user does not exist', async () => {
      const requestBody = {
        ...validSecurePinRequest,
        gewisId: 99999, // Non-existent GEWIS ID
        posId: ctx.pointOfSale.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin-secure')
        .set('Authorization', `Bearer ${ctx.posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('User 99999 not registered');
    });

    it('should return HTTP 403 when PIN is incorrect', async () => {
      const requestBody = {
        ...validSecurePinRequest,
        pin: '9999', // Wrong PIN
        posId: ctx.pointOfSale.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin-secure')
        .set('Authorization', `Bearer ${ctx.posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });

    it('should return HTTP 403 when user does not have a PIN authenticator', async () => {
      // Create a user without PIN
      const userWithoutPin = await User.save({
        firstName: 'No',
        lastName: 'Pin',
        type: UserType.MEMBER,
        active: true,
      } as User);

      const gewisUserWithoutPin = await GewisUser.save({
        user: userWithoutPin,
        gewisId: 54321,
      } as GewisUser);

      const requestBody = {
        gewisId: gewisUserWithoutPin.gewisId,
        pin: '1234',
        posId: ctx.pointOfSale.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin-secure')
        .set('Authorization', `Bearer ${ctx.posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });
});

