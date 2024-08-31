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
import { DataSource } from 'typeorm';
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import ServerSetting, { ISettings } from '../../../src/entity/server-setting';
import { expect } from 'chai';
import settingDefaults from '../../../src/server-settings/setting-defaults';

describe('ServerSettingsStore', () => {
  let ctx: {
    connection: DataSource,
  };

  before(async () => {
    ctx = {
      connection: await database.initialize(),
    };
    ServerSettingsStore.deleteInstance();
  });

  afterEach(async () => {
    await ServerSetting.delete({});
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#initialize', () => {
    it('should correctly initialize all settings with their defaults', async () => {
      // Check precondition
      let dbSettings = await ServerSetting.find();
      expect(dbSettings).to.be.lengthOf(0);

      const store = new ServerSettingsStore();
      await store.initialize();

      // Check precondition
      dbSettings = await ServerSetting.find();
      expect(dbSettings).to.be.lengthOf(Object.keys(settingDefaults).length);
      dbSettings.forEach((setting) => {
        const hardcodedDefault = settingDefaults[setting.key];
        expect(hardcodedDefault).to.not.be.undefined;
        expect(setting.value).to.deep.equal(hardcodedDefault);
      });
    });
    it('should not overwrite existing setting with default if it already exists', async () => {
      // Check precondition
      let dbSettings = await ServerSetting.find();
      expect(dbSettings).to.be.lengthOf(0);

      const key: keyof ISettings = 'highVatGroupId';
      const value: ISettings[keyof ISettings] = 39;
      // Sanity check
      expect(value).to.not.deep.equal(settingDefaults[key]);

      await ServerSetting.save({ key, value });

      const store = new ServerSettingsStore();
      await store.initialize();

      const dbSetting = await ServerSetting.findOne({ where: { key } });
      expect(dbSetting.value).to.deep.equal(value);
      expect(dbSetting.value).to.not.deep.equal(settingDefaults[key]);
    });
    it('should throw if already initialized', async () => {
      const store = new ServerSettingsStore();
      await store.initialize();
      await expect(store.initialize()).to.eventually.be.rejectedWith('ServerSettingsStore already initialized!');
    });
  });
  describe('.getSettingFromDatabase (static)', () => {
    it('should correctly return value if key exists in the database', async () => {
      await ServerSettingsStore.getInstance().initialize();

      const key: keyof ISettings = 'highVatGroupId';
      const value = await ServerSettingsStore.getSettingFromDatabase(key);
      expect(value).to.equal(settingDefaults[key]);
    });
    it('should return null if key does not exist', async () => {
      const key: keyof ISettings = 'highVatGroupId';

      // Sanity check
      const record = await ServerSetting.findOne({ where: { key } });
      expect(record).to.be.null;

      const value = await ServerSettingsStore.getSettingFromDatabase(key);
      expect(value).to.be.null;
    });
  });
  describe('#getSetting', () => {
    it('should correctly get a setting from store', async () => {
      const store = await new ServerSettingsStore().initialize();

      const keys = Object.keys(settingDefaults);
      keys.forEach((key: keyof ISettings) => {
        const storedValue = store.getSetting(key);
        expect(storedValue).to.equal(settingDefaults[key]);
      });
    });
    it('should throw if key does not exist', async () => {
      const store = await new ServerSettingsStore().initialize();
      const randomKey = '39Vooooo' as any as keyof ISettings;
      // Sanity check
      expect(settingDefaults[randomKey]).to.be.undefined;

      expect(() => store.getSetting(randomKey)).to.throw(`Setting with key "${randomKey}" does not exist.`);
    });
    it('should throw if not initialized', async () => {
      const store = new ServerSettingsStore();

      const key: keyof ISettings = 'highVatGroupId';
      expect(() => store.getSetting(key)).to.throw('ServerSettingsStore has not been initialized.');
    });
  });
  describe('#getSettingFromDatabase', () => {
    it('should fetch a setting directly from the database', async () => {
      const store = await new ServerSettingsStore().initialize();
      const key: keyof ISettings = 'highVatGroupId';
      const oldValue = store.getSetting(key);
      const newValue: ISettings['highVatGroupId'] = 1000;
      // Check precondition
      expect(oldValue).to.equal(settingDefaults[key]);
      expect(oldValue).to.not.equal(newValue);

      // Change value of key in database, but not in store
      await ServerSetting.update({ key }, { value: newValue });

      // #getSetting should return "old" value
      expect(store.getSetting(key)).to.equal(oldValue);
      // #getSettingFromDatabase should return new value, AND update the existing value in the store
      await expect(store.getSettingFromDatabase(key)).to.eventually.equal(newValue);
      // #getSetting should return "new" value
      expect(store.getSetting(key)).to.equal(newValue);
    });
    it('should throw if key does not exist', async () => {
      const store = await new ServerSettingsStore().initialize();
      const randomKey = '39Vooooo' as any as keyof ISettings;
      // Sanity check
      expect(settingDefaults[randomKey]).to.be.undefined;

      await expect(store.getSettingFromDatabase(randomKey)).to.eventually.be.rejectedWith(`Setting with key "${randomKey}" does not exist.`);
    });
    it('should throw if not initialized', async () => {
      const store = new ServerSettingsStore();

      const key: keyof ISettings = 'highVatGroupId';
      await expect(store.getSettingFromDatabase(key)).to.eventually.be.rejectedWith('ServerSettingsStore has not been initialized.');
    });
  });
  describe('#setSetting', () => {
    it('should correctly set a setting to the store', async () => {
      const store = await new ServerSettingsStore().initialize();

      const key: keyof ISettings = 'highVatGroupId';
      let dbSetting = await ServerSetting.findOne({ where: { key } });
      // Sanity check
      expect(dbSetting.value).to.deep.equal(settingDefaults[key]);
      const value: ISettings[keyof ISettings] = 39;

      await store.setSetting(key, value);
      expect(store.getSetting(key)).to.deep.equal(value);
      dbSetting = await ServerSetting.findOne({ where: { key } });
      expect(dbSetting.value).to.deep.equal(value);
    });
    it('should throw if key does not exist', async () => {
      const store = await new ServerSettingsStore().initialize();
      const randomKey = '39Vooooo' as any as keyof ISettings;
      // Sanity check
      expect(settingDefaults[randomKey]).to.be.undefined;

      await expect(store.setSetting(randomKey, 9)).to.eventually.be.rejectedWith(`Setting with key "${randomKey}" does not exist.`);
    });
    it('should throw if not initialized', async () => {
      const store = new ServerSettingsStore();

      const key: keyof ISettings = 'highVatGroupId';
      const value: ISettings[keyof ISettings] = 39;

      await expect(store.setSetting(key, value)).to.eventually.be.rejectedWith('ServerSettingsStore has not been initialized.');
    });
  });
  describe('#getInstance', () => {
    it('should return same instance', async () => {
      ServerSettingsStore.deleteInstance();
      const store = ServerSettingsStore.getInstance();
      expect(store.initialized).to.be.false;

      await store.initialize();
      expect(store.initialized).to.be.true;

      expect(ServerSettingsStore.getInstance().initialized).to.be.true;
    });
  });
});
