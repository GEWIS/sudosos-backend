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

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User from '../../../src/entity/user/user';
import UserNotificationPreference from '../../../src/entity/notifications/user-notification-preference';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { UserSeeder } from '../../seed';
import UserNotificationSeeder from '../../seed/ledger/user-notification-seeder';
import Swagger from '../../../src/start/swagger';
import bodyParser from 'body-parser';
import { finishTestDB } from '../../helpers/test-helpers';
import UserNotificationPreferenceService from '../../../src/service/user-notification-preference-service';
import { expect } from 'chai';

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
      const actualPreferences = ctx.userNotificationPreferences.filter((p) => p.id === user.id);
      expect(res.length).to.equal(actualPreferences.length);

      res.forEach((p) => expect(p.id).to.equal(user.id));
    });

    it('should return a single preference if id is specfified', async () => {
      const res: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { userNotificationPreferenceId: ctx.userNotificationPreferences[0].id },
      );
      expect(res.length).to.equal(1);
      expect(res[0].id).to.be.equal(ctx.userNotificationPreferences[0].id);
    });
  });
});