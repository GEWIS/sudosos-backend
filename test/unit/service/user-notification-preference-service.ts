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
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import UserNotificationPreference, {
  NotificationChannels,
} from '../../../src/entity/notifications/user-notification-preference';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { UserSeeder } from '../../seed';
import UserNotificationSeeder from '../../seed/ledger/user-notification-seeder';
import Swagger from '../../../src/start/swagger';
import bodyParser from 'body-parser';
import { finishTestDB } from '../../helpers/test-helpers';
import UserNotificationPreferenceService from '../../../src/service/user-notification-preference-service';
import { expect } from 'chai';
import {NotificationTypeRegistry, NotificationTypes} from '../../../src/notifications/notification-types';
import {
  PaginatedUserNotificationPreferenceResponse,
} from '../../../src/controller/response/user-notification-preference-response';
import { UserFactory } from '../../helpers/user-factory';

describe('UserNotificationPreferenceService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    userNotificationPreferences: UserNotificationPreference[],
  };

  before(async (): Promise<void> => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const userNotificationPreferences = await new UserNotificationSeeder().seed(users);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      userNotificationPreferences,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('getUserNotificationPreferences function', async (): Promise<void> => {
    it('should return all user notification preferences', async () => {
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences();
      expect(res.length).to.equal(ctx.userNotificationPreferences.length);
      const ids = new Set(ctx.userNotificationPreferences.map((obj) => obj.id));
      res.forEach((element) => ids.delete(element.id));
      expect(ids.size).to.equal(0);
    });

    it('should return all user notification preferences for a single user', async () => {
      const user = ctx.users[0];
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { userId: user.id },
      );
      const actualPreferences = ctx.userNotificationPreferences.filter((p) => p.userId === user.id);
      expect(res.length).to.equal(actualPreferences.length);

      res.forEach((p) => expect(p.userId).to.equal(user.id));
    });

    it('should return a single preference if id is specified', async () => {
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { userNotificationPreferenceId: ctx.userNotificationPreferences[0].id },
      );
      expect(res.length).to.equal(1);
      expect(res[0].id).to.be.equal(ctx.userNotificationPreferences[0].id);
    });

    it('should return all preferences for a specific type', async () => {
      const type = NotificationTypes.UserGotFined;
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { type },
      );
      const actualPreferences = ctx.userNotificationPreferences.filter((p) => p.type === type);
      expect(res.length).to.equal(actualPreferences.length);

      res.forEach((p) => expect(p.type).to.equal(type));
    });

    it('should return all preferences for a specific channel', async () => {
      const channel = NotificationChannels.EMAIL;
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { channel },
      );
      const actualPreferences = ctx.userNotificationPreferences.filter((p) => p.channel === channel);
      expect(res.length).to.equal(actualPreferences.length);

      res.forEach((p) => expect(p.channel).to.equal(channel));
    });

    it('should return all enabled preferences', async () => {
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { enabled: true },
      );
      const actualPreferences = ctx.userNotificationPreferences.filter((p) => p.enabled);
      expect(res.length).to.equal(actualPreferences.length);

      res.forEach((p) => expect(p.enabled).to.be.true);
    });
    it('should return only mandatory preferences when isMandatory is true', async () => {
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { isMandatory: true },
      );

      res.forEach((p) => {
        const isMandatoryInRegistry = NotificationTypeRegistry.isTypeMandatory(p.type as NotificationTypes);
        expect(isMandatoryInRegistry).to.be.true;

        expect(p.isMandatory).to.be.true;
      });

      const expectedCount = ctx.userNotificationPreferences.filter(
        (p) => NotificationTypeRegistry.isTypeMandatory(p.type as NotificationTypes) === true,
      ).length;

      expect(res.length).to.equal(expectedCount);
    });

    it('should return only non-mandatory preferences when isMandatory is false', async () => {
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { isMandatory: false },
      );

      res.forEach((p) => {
        const isMandatoryInRegistry = NotificationTypeRegistry.isTypeMandatory(p.type as NotificationTypes);
        expect(isMandatoryInRegistry).to.be.false;
        expect(p.isMandatory).to.be.false;
      });

      const expectedCount = ctx.userNotificationPreferences.filter(
        (p) => NotificationTypeRegistry.isTypeMandatory(p.type as NotificationTypes) === false,
      ).length;

      expect(res.length).to.equal(expectedCount);
    });
  });

  describe('paginatedUserNotificationPreferences function', async (): Promise<void> => {
    it('should return all user notification preferences correctly paginated', async () => {
      const take = 5;
      const skip = 5;

      const res: PaginatedUserNotificationPreferenceResponse = await new UserNotificationPreferenceService().getPaginatedUserNotificationPreference(
        {}, { take, skip },
      );
      
      expect(res.records.length).to.equal(take);
      expect(res._pagination.skip).to.equal(skip);
      expect(res._pagination.take).to.equal(take);
      expect(res._pagination.count).to.equal(ctx.userNotificationPreferences.length);
    });
  });

  describe('createUserNotificationPreference function', async (): Promise<void> => {
    it('should correctly create a user notification preference', async () => {
      const user = ctx.users[0];
      const preference = ctx.userNotificationPreferences.find((p) => p.userId === user.id);

      await preference.remove();

      const res = await new UserNotificationPreferenceService().createUserNotificationPreference(
        { userId: user.id, type: preference.type, channel: preference.channel, enabled: true },
      );
      expect(res.userId).to.equal(user.id);
      expect(res.type).to.equal(preference.type);
      expect(res.channel).to.equal(preference.channel);
      expect(res.enabled).to.equal(true);
    });
  });

  describe('updateUserNotificationPreference function', async (): Promise<void> => {
    it('should correctly update a user notification preference', async () => {
      const user = ctx.users[0];
      const preference = ctx.userNotificationPreferences
        .filter(p => p.id !== undefined)
        .find(p => p.userId === user.id);

      const res = await new UserNotificationPreferenceService().updateUserNotificationPreference(
        { userNotificationPreferenceId: preference.id, enabled: !preference.enabled },
      );

      expect(res.user.id).to.equal(user.id);
      expect(res.enabled).to.equal(!preference.enabled);
    });
  });

  describe('syncAllUserNotificationPreferences function', async (): Promise<void> => {
    it('should sync all users who miss notification preferences', async () => {
      const newUser = await (await UserFactory({
        firstName: 'TestUser',
        active: true,
        type: UserType.LOCAL_ADMIN,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        email: 'test@example.com',
      } as User)).get();

      const existingPrefs = await UserNotificationPreference.find({ where: { userId: newUser.id } });
      expect(existingPrefs.length).to.eq(0);

      await new UserNotificationPreferenceService().syncAllUserNotificationPreferences();

      const allPrefs = await UserNotificationPreference.find({ where: { userId: newUser.id } });

      const totalCombinations = Object.values(NotificationTypes).length * Object.values(NotificationChannels).length;
      expect(allPrefs.length).to.eq(totalCombinations);

      for (const type of Object.values(NotificationTypes)) {
        for (const channel of Object.values(NotificationChannels)) {
          const exists = allPrefs.some(p => p.type === type && p.channel === channel);
          expect(exists).to.eq(true);
        }
      }
    });


  });
});