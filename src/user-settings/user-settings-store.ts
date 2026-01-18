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

/**
 * This is the module page of the user-settings store.
 *
 * @module internal/user-settings
 */

import { Repository } from 'typeorm';
import UserSetting, { IUserSettings } from '../entity/user-setting';
import UserSettingsDefaults from './user-settings-defaults';
import { UserSettingsResponse } from '../controller/response/user-response';

/**
 * Store of user-specific settings, which are key-value pairs stored in the database.
 * Unlike ServerSettingsStore, this is not a singleton and always queries the database
 * to ensure settings are up-to-date.
 */
export default class UserSettingsStore<T extends keyof IUserSettings = keyof IUserSettings> {
  private repo: Repository<UserSetting>;

  constructor() {
    this.repo = UserSetting.getRepository();
  }

  /**
   * Get a user setting from the database. Returns the default value if the setting
   * doesn't exist or is null/undefined.
   * @param userId - The ID of the user
   * @param key - The setting key
   */
  public async getSetting(userId: number, key: T): Promise<IUserSettings[T]> {
    const setting = await this.repo.findOne({
      where: { userId, key },
    });

    if (!setting || setting.value == null) {
      return UserSettingsDefaults[key] as IUserSettings[T];
    }

    return setting.value as IUserSettings[T];
  }

  /**
   * Get all settings for a user from the database. Returns defaults for any
   * settings that don't exist or are null/undefined.
   * @param userId - The ID of the user
   */
  public async getAllSettings(userId: number): Promise<IUserSettings> {
    const settings = await this.repo.find({
      where: { userId },
    });

    const result: IUserSettings = { ...UserSettingsDefaults };

    settings.forEach((setting) => {
      if (setting.value != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any)[setting.key] = setting.value;
      }
    });

    return result;
  }

  /**
   * Update or create a single user setting
   * If value is undefined, the setting is deleted (to distinguish from null).
   * @param userId - The ID of the user
   * @param key - The setting key
   * @param value - The setting value
   */
  public async setSetting(userId: number, key: T, value: IUserSettings[T]): Promise<UserSetting | void> {
    // If value is undefined, delete the setting to distinguish from null
    if (value === undefined) {
      const setting = await this.repo.findOne({
        where: { userId, key },
      });
      if (setting) {
        await this.repo.remove(setting);
      }
      return;
    }

    let setting = await this.repo.findOne({
      where: { userId, key },
    });

    if (!setting) {
      setting = this.repo.create({ userId, key, value });
    } else {
      setting.value = value;
    }

    return this.repo.save(setting);
  }

  /**
   * Update or create multiple user settings at once
   * Undefined values are ignored (not processed), allowing partial updates without
   * accidentally resetting settings. To explicitly delete a setting, use setSetting
   * with undefined.
   * @param userId - The ID of the user
   * @param settings - Partial settings object with key-value pairs to update
   */
  public async setSettings(userId: number, settings: Partial<IUserSettings>): Promise<UserSetting[]> {
    const results = await Promise.all(
      (Object.entries(settings) as [keyof IUserSettings, IUserSettings[keyof IUserSettings]][]).map(
        async (entry) => {
          const [key, value] = entry;
          // Ignore undefined values in batch updates
          if (value === undefined) {
            return undefined;
          }
          return this.setSetting(userId, key as T, value as IUserSettings[T]);
        },
      ),
    );

    // Filter out void results (deleted settings or ignored undefined values)
    return results.filter((result): result is UserSetting => result !== undefined);
  }

  /**
   * Convert IUserSettings to UserSettingsResponse
   * @param settings - The user settings to convert
   */
  public static toResponse(settings: IUserSettings): UserSettingsResponse {
    return {
      betaEnabled: settings.betaEnabled,
      dashboardTheme: settings.dashboardTheme,
      language: settings.language,
    };
  }
}
