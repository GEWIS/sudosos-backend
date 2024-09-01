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
import { Repository } from 'typeorm';
import ServerSetting, { ISettings } from '../entity/server-setting';
import SettingsDefaults from './setting-defaults';
import { AppDataSource } from '../database/database';

/**
 * Store of global server settings, which are key-value pairs stored in the database.
 * Used for settings that fit a database store better than an environment variable,
 * as the latter should contain mostly secrets to get things to work, not to
 * configure stuff.
 */
export default class ServerSettingsStore<T extends keyof ISettings = keyof ISettings> {
  private static instance: ServerSettingsStore;

  private _initialized = false;

  private repo: Repository<ServerSetting>;

  private settings: ISettings;

  constructor() {
    this.repo = ServerSetting.getRepository();
  }

  /**
   * Singleton, because there is only one copy of the core running at a time.
   * We can therefore simply initialize the store once and keep it up to date
   * from memory.
   */
  public static getInstance() {
    if (!this.instance) {
      this.instance = new ServerSettingsStore();
    }
    return this.instance;
  }

  get initialized() {
    return this._initialized;
  }

  private isInitialized() {
    if (!this._initialized) throw new Error('ServerSettingsStore has not been initialized.');
  }

  /**
   * Fetch all key-value pairs from the database
   */
  public async initialize() {
    if (this._initialized) {
      throw new Error('ServerSettingsStore already initialized!');
    }

    const settings = await this.repo.find();
    const promises: Promise<ServerSetting>[] = [];

    // Save any new key-value pairs to the database if they don't yet exist
    Object.entries(SettingsDefaults).forEach((entry) => {
      const key = entry[0] as keyof ISettings;
      const value = entry[1];
      const setting = settings.find((s) => s.key === key);
      if (!setting) {
        const promise = this.repo.save({ key, value });
        // Add the missing setting key with its default value
        promises.push(promise);
      }
    });

    // The settings object now contains all key-value pairs
    settings.push(...(await Promise.all(promises)));

    const map = new Map<ServerSetting['key'], ServerSetting['value']>();
    Object.keys(SettingsDefaults).forEach((key) => {
      const setting = settings.find((s) => s.key === key);
      // Sanity check
      if (!setting) throw new Error(`Setting "${key}" missing during initialization`);
      map.set(setting.key, setting.value);
    });

    this.settings = Object.fromEntries(map) as any as ISettings;
    this._initialized = true;

    return this;
  }

  /**
   * Get a server setting. If the setting is subject to change during runtime,
   * use the "getSettingFromDatabase" method instead.
   * @param key
   */
  public getSetting(key: T): ISettings[T] {
    this.isInitialized();
    if (this.settings[key] === undefined) {
      throw new Error(`Setting with key "${key}" does not exist.`);
    }
    return this.settings[key];
  }

  /**
   * Get a server setting from the database. This ensures it is always up to date,
   * but adds some latency due to a database query.
   * @param key
   */
  public async getSettingFromDatabase(key: T): Promise<ISettings[T]> {
    this.isInitialized();
    const value = await ServerSettingsStore.getSettingFromDatabase(key);
    if (value == null) {
      throw new Error(`Setting with key "${key}" does not exist.`);
    }
    this.settings[key] = value;
    return value;
  }

  /**
   * Get a server setting from the database. Returns null if it does not exist.
   * Compared to the class method, this method does not update the internal cache.
   * @param key
   */
  public static async getSettingFromDatabase<T extends keyof ISettings>(key: T): Promise<ISettings[T] | null> {
    const record = await AppDataSource.manager.findOne(ServerSetting, { where: { key } });
    if (!record) return null;
    return record.value as ISettings[T];
  }

  /**
   * Update a server setting
   * @param key
   * @param value
   */
  public async setSetting(key: T, value: ISettings[T]) {
    this.isInitialized();
    const setting = await this.repo.findOne({ where: { key } });
    if (!setting) {
      throw new Error(`Setting with key "${key}" does not exist.`);
    }
    setting!.value = value;
    this.settings[key] = value;
    return this.repo.save(setting!);
  }

  /**
   * Only for testing, never use in production
   */
  public static deleteInstance() {
    this.instance = undefined;
  }
}
