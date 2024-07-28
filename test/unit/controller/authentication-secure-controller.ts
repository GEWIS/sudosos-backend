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
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import {
  seedContainers,
  seedMemberAuthenticators,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import AuthenticationResponse from '../../../src/controller/response/authentication-response';
import DefaultRoles from '../../../src/rbac/default-roles';
import { getToken } from '../../seed/rbac';
import settingDefaults from '../../../src/server-settings/setting-defaults';

describe('AuthenticationSecureController', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    specification: SwaggerSpecification,
    controller: AuthenticationSecureController,
    users: User[],
    memberAuthenticators: MemberAuthenticator[],
    adminUser: User,
    adminToken: string,
    memberUser: User,
    userToken: string,
    organUser: User,
    pointOfSaleUsers: User[],
    pointsOfSale: PointOfSale[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();
    const memberAuthenticators = await seedMemberAuthenticators(
      users.filter((u) => u.type !== UserType.ORGAN),
      users.filter((u) => u.type === UserType.ORGAN),
    );

    const vatGroups = await seedVatGroups();
    const categories = await seedProductCategories();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointsOfSale, pointOfSaleUsers } = await seedPointsOfSale(users, containerRevisions);

    await DefaultRoles.synchronize();
    const roleManager = new RoleManager();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminUser = users.find((u) => u.type === UserType.LOCAL_ADMIN);
    const memberUser = users.find((u) => u.type === UserType.MEMBER);
    const organUser = users.find((u) => u.type === UserType.ORGAN);
    const adminToken = await tokenHandler.signToken(await getToken(adminUser), 'nonce');
    const userToken = await tokenHandler.signToken(await getToken(memberUser, [], [organUser]), 'nonce');

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
      users,
      adminUser,
      adminToken,
      memberUser,
      userToken,
      organUser,
      memberAuthenticators,
      pointsOfSale,
      pointOfSaleUsers,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /authentication/refreshToken', () => {
    it('should return new token', async () => {
      const res = await request(ctx.app)
        .get('/authentication/refreshToken')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
  });

  describe( 'GET /authentication/pointofsale/{id}', () => {
    it('should return a token for a point of sale if admin', async () => {
      // Admin does not own the POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id !== ctx.adminUser.id);
      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as AuthenticationResponse;
      expect(body.user.id).to.equal(pos.user.id);
      expect(body.rolesWithPermissions.some((r) => r.name === 'Point of Sale')).to.be.true;

      // JWT should have longer expiry compare to standard JWT tokens
      const payload = await ctx.tokenHandler.verifyToken(body.token);
      expect(payload.exp - payload.iat).to.equal(settingDefaults.jwtExpiryPointOfSale);
    });
    it('should return a token for a point of sale if owner', async () => {
      // User owns the POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id === ctx.memberUser.id);
      expect(pos).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as AuthenticationResponse;
      expect(body.user.id).to.equal(pos.user.id);
      expect(body.rolesWithPermissions.some((r) => r.name === 'Point of Sale')).to.be.true;
    });
    it('should return a token for a point of sale if part of organ', async () => {
      // User part of the organ of POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id === ctx.organUser.id);
      expect(pos).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as AuthenticationResponse;
      expect(body.user.id).to.equal(pos.user.id);
      expect(body.rolesWithPermissions.some((r) => r.name === 'Point of Sale')).to.be.true;
    });
    it('should return an HTTP 404 if POS is soft deleted', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.deletedAt != null);
      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of sale not found.');
    });
    it('should return an HTTP 404 if POS does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${ctx.pointsOfSale.length + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of sale not found.');
    });
    it('should return an HTTP 403 if user cannot access POS', async () => {
      // User part of the organ of POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id !== ctx.organUser.id);
      expect(pos).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });
});
