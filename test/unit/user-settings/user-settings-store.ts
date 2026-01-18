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
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import UserSettingsStore from '../../../src/user-settings/user-settings-store';
import UserSetting, { IUserSettings } from '../../../src/entity/user-setting';
import { expect } from 'chai';
import UserSettingsDefaults from '../../../src/user-settings/user-settings-defaults';
import User, { UserType, TermsOfServiceStatus } from '../../../src/entity/user/user';

describe('UserSettingsStore', () => {
  let ctx: {
    connection: DataSource,
    user1: User,
    user2: User,
  };

  before(async () => {
    ctx = {
      connection: await database.initialize(),
      user1: undefined,
      user2: undefined,
    };

    // Create test users
    ctx.user1 = Object.assign(new User(), {
      firstName: 'Test',
      lastName: 'User1',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);
    await User.save(ctx.user1);

    ctx.user2 = Object.assign(new User(), {
      firstName: 'Test',
      lastName: 'User2',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User);
    await User.save(ctx.user2);
  });

  afterEach(async () => {
    await UserSetting.clear();
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#getSetting', () => {
    it('should return default value when setting does not exist', async () => {
      const store = new UserSettingsStore();

      const betaEnabled = await store.getSetting(ctx.user1.id, 'betaEnabled');
      expect(betaEnabled).to.equal(UserSettingsDefaults.betaEnabled);

      const dashboardTheme = await store.getSetting(ctx.user1.id, 'dashboardTheme');
      expect(dashboardTheme).to.deep.equal(UserSettingsDefaults.dashboardTheme);

      const language = await store.getSetting(ctx.user1.id, 'language');
      expect(language).to.equal(UserSettingsDefaults.language);
    });

    it('should return stored value when setting exists', async () => {
      const store = new UserSettingsStore();

      const key: keyof IUserSettings = 'betaEnabled';
      const value: IUserSettings['betaEnabled'] = true;

      await store.setSetting(ctx.user1.id, key, value);

      const result = await store.getSetting(ctx.user1.id, key);
      expect(result).to.equal(value);
    });

    it('should return different values for different users', async () => {
      const store = new UserSettingsStore();

      await store.setSetting(ctx.user1.id, 'betaEnabled', true);
      await store.setSetting(ctx.user2.id, 'betaEnabled', false);

      const user1Value = await store.getSetting(ctx.user1.id, 'betaEnabled');
      const user2Value = await store.getSetting(ctx.user2.id, 'betaEnabled');

      expect(user1Value).to.equal(true);
      expect(user2Value).to.equal(false);
    });

    it('should handle dashboardTheme setting', async () => {
      const store = new UserSettingsStore();

      const theme = { organId: 1, organName: 'Test Organ' };
      await store.setSetting(ctx.user1.id, 'dashboardTheme', theme);

      const result = await store.getSetting(ctx.user1.id, 'dashboardTheme');
      expect(result).to.deep.equal(theme);
    });

    it('should handle language setting', async () => {
      const store = new UserSettingsStore();

      const language: IUserSettings['language'] = 'nl-NL';
      await store.setSetting(ctx.user1.id, 'language', language);

      const result = await store.getSetting(ctx.user1.id, 'language');
      expect(result).to.equal(language);
    });

    it('should handle undefined language setting', async () => {
      const store = new UserSettingsStore();

      // Set language to undefined (should not store it, return default)
      const result = await store.getSetting(ctx.user1.id, 'language');
      expect(result).to.equal(undefined);
    });
  });

  describe('#getAllSettings', () => {
    it('should return all defaults when no settings exist', async () => {
      const store = new UserSettingsStore();

      const settings = await store.getAllSettings(ctx.user1.id);

      expect(settings).to.deep.equal(UserSettingsDefaults);
    });

    it('should return defaults merged with stored settings', async () => {
      const store = new UserSettingsStore();

      await store.setSetting(ctx.user1.id, 'betaEnabled', true);
      await store.setSetting(ctx.user1.id, 'language', 'en-US');

      const settings = await store.getAllSettings(ctx.user1.id);

      expect(settings.betaEnabled).to.equal(true);
      expect(settings.language).to.equal('en-US');
      expect(settings.dashboardTheme).to.deep.equal(UserSettingsDefaults.dashboardTheme);
    });

    it('should return different settings for different users', async () => {
      const store = new UserSettingsStore();

      await store.setSetting(ctx.user1.id, 'betaEnabled', true);
      await store.setSetting(ctx.user2.id, 'betaEnabled', false);
      await store.setSetting(ctx.user1.id, 'language', 'nl-NL');
      await store.setSetting(ctx.user2.id, 'language', 'pl-PL');

      const user1Settings = await store.getAllSettings(ctx.user1.id);
      const user2Settings = await store.getAllSettings(ctx.user2.id);

      expect(user1Settings.betaEnabled).to.equal(true);
      expect(user1Settings.language).to.equal('nl-NL');
      expect(user2Settings.betaEnabled).to.equal(false);
      expect(user2Settings.language).to.equal('pl-PL');
    });
  });

  describe('#setSetting', () => {
    it('should create a new setting when it does not exist', async () => {
      const store = new UserSettingsStore();

      const key: keyof IUserSettings = 'betaEnabled';
      const value: IUserSettings['betaEnabled'] = true;

      await store.setSetting(ctx.user1.id, key, value);

      const dbSetting = await UserSetting.findOne({ where: { userId: ctx.user1.id, key } });
      expect(dbSetting).to.not.be.null;
      expect(dbSetting.value).to.equal(value);
    });

    it('should update an existing setting', async () => {
      const store = new UserSettingsStore();

      const key: keyof IUserSettings = 'betaEnabled';
      const initialValue: IUserSettings['betaEnabled'] = false;
      const newValue: IUserSettings['betaEnabled'] = true;

      await store.setSetting(ctx.user1.id, key, initialValue);
      await store.setSetting(ctx.user1.id, key, newValue);

      const dbSetting = await UserSetting.findOne({ where: { userId: ctx.user1.id, key } });
      expect(dbSetting.value).to.equal(newValue);
    });

    it('should store settings independently per user', async () => {
      const store = new UserSettingsStore();

      await store.setSetting(ctx.user1.id, 'betaEnabled', true);
      await store.setSetting(ctx.user2.id, 'betaEnabled', false);

      const user1Setting = await UserSetting.findOne({ where: { userId: ctx.user1.id, key: 'betaEnabled' } });
      const user2Setting = await UserSetting.findOne({ where: { userId: ctx.user2.id, key: 'betaEnabled' } });

      expect(user1Setting.value).to.equal(true);
      expect(user2Setting.value).to.equal(false);
    });

    it('should handle dashboardTheme setting', async () => {
      const store = new UserSettingsStore();

      const theme = { organId: 1, organName: 'Test Organ' };
      await store.setSetting(ctx.user1.id, 'dashboardTheme', theme);

      const result = await store.getSetting(ctx.user1.id, 'dashboardTheme');
      expect(result).to.deep.equal(theme);
    });

    it('should handle null dashboardTheme', async () => {
      const store = new UserSettingsStore();

      await store.setSetting(ctx.user1.id, 'dashboardTheme', null);

      const result = await store.getSetting(ctx.user1.id, 'dashboardTheme');
      expect(result).to.equal(null);
    });

    it('should handle language setting', async () => {
      const store = new UserSettingsStore();

      const language: IUserSettings['language'] = 'pl-PL';
      await store.setSetting(ctx.user1.id, 'language', language);

      const result = await store.getSetting(ctx.user1.id, 'language');
      expect(result).to.equal(language);
    });
  });

  describe('#setSettings', () => {
    it('should update multiple settings at once', async () => {
      const store = new UserSettingsStore();

      const updates: Partial<IUserSettings> = {
        betaEnabled: true,
        language: 'nl-NL',
      };

      await store.setSettings(ctx.user1.id, updates);

      const settings = await store.getAllSettings(ctx.user1.id);
      expect(settings.betaEnabled).to.equal(true);
      expect(settings.language).to.equal('nl-NL');
    });

    it('should only update provided settings', async () => {
      const store = new UserSettingsStore();

      // Set initial values
      await store.setSetting(ctx.user1.id, 'betaEnabled', false);
      await store.setSetting(ctx.user1.id, 'language', 'en-US');

      // Update only betaEnabled
      await store.setSettings(ctx.user1.id, { betaEnabled: true });

      const settings = await store.getAllSettings(ctx.user1.id);
      expect(settings.betaEnabled).to.equal(true);
      expect(settings.language).to.equal('en-US'); // Should remain unchanged
    });

    it('should handle partial updates with undefined values', async () => {
      const store = new UserSettingsStore();

      // Set initial values
      await store.setSetting(ctx.user1.id, 'betaEnabled', true);
      await store.setSetting(ctx.user1.id, 'language', 'nl-NL');

      // Update with undefined language (should not change it)
      await store.setSettings(ctx.user1.id, { language: undefined });

      const settings = await store.getAllSettings(ctx.user1.id);
      expect(settings.betaEnabled).to.equal(true);
      expect(settings.language).to.equal('nl-NL'); // Should remain unchanged
    });

    it('should handle dashboardTheme in batch update', async () => {
      const store = new UserSettingsStore();

      const theme = { organId: 2, organName: 'Batch Organ' };
      const updates: Partial<IUserSettings> = {
        betaEnabled: true,
        dashboardTheme: theme,
        language: 'pl-PL',
      };

      await store.setSettings(ctx.user1.id, updates);

      const settings = await store.getAllSettings(ctx.user1.id);
      expect(settings.betaEnabled).to.equal(true);
      expect(settings.dashboardTheme).to.deep.equal(theme);
      expect(settings.language).to.equal('pl-PL');
    });
  });

  describe('#toResponse', () => {
    it('should convert IUserSettings to UserSettingsResponse', () => {
      const settings: IUserSettings = {
        betaEnabled: true,
        dashboardTheme: { organId: 1, organName: 'Test' },
        language: 'nl-NL',
      };

      const response = UserSettingsStore.toResponse(settings);

      expect(response).to.deep.equal({
        betaEnabled: true,
        dashboardTheme: { organId: 1, organName: 'Test' },
        language: 'nl-NL',
      });
    });

    it('should handle null dashboardTheme', () => {
      const settings: IUserSettings = {
        betaEnabled: false,
        dashboardTheme: null,
        language: undefined,
      };

      const response = UserSettingsStore.toResponse(settings);

      expect(response).to.deep.equal({
        betaEnabled: false,
        dashboardTheme: null,
        language: undefined,
      });
    });

    it('should handle undefined language', () => {
      const settings: IUserSettings = {
        betaEnabled: true,
        dashboardTheme: null,
        language: undefined,
      };

      const response = UserSettingsStore.toResponse(settings);

      expect(response.language).to.equal(undefined);
    });
  });
});
