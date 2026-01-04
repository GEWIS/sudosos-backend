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

import { DataSource } from 'typeorm';
import express, { Application, json } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import UserNotificationPreference, {
  NotificationChannels,
} from '../../../src/entity/notifications/user-notification-preference';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { RbacSeeder, UserSeeder } from '../../seed';
import UserNotificationSeeder from '../../seed/ledger/user-notification-seeder';
import Swagger from '../../../src/start/swagger';
import { finishTestDB } from '../../helpers/test-helpers';
import RoleManager from '../../../src/rbac/role-manager';
import TokenHandler from '../../../src/authentication/token-handler';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import {
  UserNotificationPreferenceUpdateRequest,
  UserNotificationPreferenceRequest,
} from '../../../src/controller/request/user-notification-preference-request';
import UserNotificationController from '../../../src/controller/user-notification-preference-controller';
import { NotificationTypes } from '../../../src/notifications/notification-types';
import { expect, request } from 'chai';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import {
  BaseUserNotificationPreferenceResponse,
} from '../../../src/controller/response/user-notification-preference-response';

describe('user-notification-preference-controller',  async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: UserNotificationController,
    adminUser: User,
    localUser: User,
    adminToken: string,
    validUserNotificationPreferenceRequest: UserNotificationPreferenceRequest,
    token: string,
    userNotificationPreferences: UserNotificationPreference[],
    updateRequest: UserNotificationPreferenceUpdateRequest,
  };

  before(async (): Promise<void> => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();

    const adminUser = {
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const localUser = {
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    users.push(adminUser);
    users.push(localUser);

    await User.save(adminUser);
    await User.save(localUser);

    const userNotificationPreferences = await new UserNotificationSeeder().seed(users);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        UserNotificationPreference: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        UserNotificationPreference: {
          get: own,
          update: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER
                || user.type === UserType.INVOICE,
    }]);
    const roleManager = await new RoleManager().initialize();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(adminUser, roles), 'nonce admin');
    const token = await tokenHandler.signToken(await new RbacSeeder().getToken(localUser, roles), 'nonce');

    const controller = new UserNotificationController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/user-notification-preferences', controller.getRouter());

    const validUserNotificationPreferenceRequest: UserNotificationPreferenceRequest = {
      userId: localUser.id,
      type: NotificationTypes.UserGotFined,
      channel: NotificationChannels.EMAIL,
    };

    const updateRequest: UserNotificationPreferenceUpdateRequest = {
      enabled: false,
    };

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      validUserNotificationPreferenceRequest,
      token,
      userNotificationPreferences,
      updateRequest,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /user-notification-preferences', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/user-notification-preferences')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      expect(ctx.specification.validateModel(
        'PaginatedUserNotificationPreferenceResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing user notification preferences if admin', async () => {
      const res = await request(ctx.app)
        .get('/user-notification-preferences')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const userNotificationPreferences = res.body.records as BaseUserNotificationPreferenceResponse[];
      const pagination = res.body._pagination as PaginationResult;

      const preferencesCount = await UserNotificationPreference.count();
      expect(userNotificationPreferences.length).to.equal(Math.min(preferencesCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(preferencesCount);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/user-notification-preferences')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const userNotificationPreferences = res.body.records as BaseUserNotificationPreferenceResponse[];
      const pagination = res.body._pagination as PaginationResult;

      const preferencesCount = await UserNotificationPreference.count();
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(preferencesCount);
      expect(userNotificationPreferences.length).to.be.at.most(take);
    });

  });

  describe('GET /user-notification-preferences/{id}', () => {
    it('should return correct model', async () => {
      const preference = (await UserNotificationPreference.find())[0];
      const res = await request(ctx.app)
        .get(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'BaseUserNotificationPreferenceResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the requested preference exists and admin', async () => {
      const preference = (await UserNotificationPreference.find())[0];
      const res = await request(ctx.app)
        .get(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect((res.body as BaseUserNotificationPreferenceResponse).id).to.eq(preference.id);
    });
    it('should return an HTTP 200 and the requested preference exists and user owns it', async () => {
      const preference = (await UserNotificationPreference.find({ where: { userId: ctx.localUser.id } }))[0];
      expect(preference).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);
      expect((res.body as BaseUserNotificationPreferenceResponse).id).to.eq(preference.id);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const preference = (await UserNotificationPreference.find({ where: { userId: ctx.adminUser.id } }))[0];
      expect(preference).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.localUser}`);

      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if preference does not exist', async () => {
      const count = await UserNotificationPreference.count();
      const preference = await UserNotificationPreference.findOne({ where: { id: count + 1 } });
      expect(preference).to.be.null;

      const res = await request(ctx.app)
        .get(`/user-notification-preferences/${count + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
    });
  });

  describe('PATCH /user-notification-preferences/{id}', () => {
    it('should return correct model', async () => {
      const preference = (await UserNotificationPreference.find({ where: { enabled: true } }))[0];
      const res = await request(ctx.app)
        .patch(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.updateRequest);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'BaseUserNotificationPreferenceResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('return an HTTP 200 and update the requested preference if admin', async () => {
      const preference = (await UserNotificationPreference.find({ where: { enabled: true } }))[0];
      const res = await request(ctx.app)
        .patch(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.updateRequest);

      expect(res.status).to.equal(200);
      expect((res.body as BaseUserNotificationPreferenceResponse).id).to.eq(preference.id);
      expect((res.body as BaseUserNotificationPreferenceResponse).enabled).to.be.eq(ctx.updateRequest.enabled);
    });
    it('should return an HTTP 200 and update the requested preference from user if own', async () => {
      const preference = (await UserNotificationPreference.find({ where: { userId: ctx.localUser.id } }))[0];
      expect(preference).to.not.be.undefined;

      const res = await request(ctx.app)
        .patch(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.updateRequest);

      expect(res.status).to.equal(200);
      expect((res.body as BaseUserNotificationPreferenceResponse).id).to.eq(preference.id);
    });
    it('should return an HTTP 403 if not admin and not own preference', async () => {

      const preference = (await UserNotificationPreference.find({ where: { userId: ctx.adminUser.id } }))[0];
      expect(preference).to.not.be.undefined;

      const res = await request(ctx.app)
        .patch(`/user-notification-preferences/${preference.id}`)
        .set('Authorization', `Bearer ${ctx.localUser}`)
        .send(ctx.updateRequest);

      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if preference not found', async () => {
      const count = await UserNotificationPreference.count();
      const preference = await UserNotificationPreference.findOne({ where: { id: count + 1 } });
      expect(preference).to.be.null;

      const res = await request(ctx.app)
        .patch(`/user-notification-preferences/${count + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.updateRequest);

      expect(res.status).to.equal(404);
    });
  });
});