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


import WithManager from '../database/with-manager';
import { asNumber } from '../helpers/validators';
import { RequestWithToken } from '../middleware/token-middleware';
import { FindManyOptions, FindOptionsRelations } from 'typeorm';
import UserNotificationPreference, { NotificationChannels } from '../entity/notifications/user-notification-preference';
import QueryFilter from '../helpers/query-filter';
import User from '../entity/user/user';
import { PaginationParameters } from '../helpers/pagination';
import {
  BaseUserNotificationPreferenceResponse,
  PaginatedUserNotificationPreferenceResponse,
} from '../controller/response/user-notification-preference-response';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import {
  UserNotificationPreferenceUpdateParams,
  UserNotificationPreferenceRequestParams,
} from '../controller/request/user-notification-preference-request';
import { NotificationTypes } from '../notifications/notification-types';

/**
 * This is the module page of the notification-service.
 *
 * @module notification
 *
 */

/**
 * Define notification filtering parameters used to filter query results.
 */
export interface UserNotificationPreferenceFilterParams {
  /**
   * Filter based on the entity id.
   */
  userNotificationPreferenceId?: number;
  /**
     * Filter based on user id.
     */
  userId?: number;
  /**
     * Filter based on notification code.
     */
  type?: string;
  /**
     * Filter based on notification channel.
     */
  channel?: string;
  /**
     * Filter based on enabled notifications.
     */
  enabled?: boolean;
}

export function parseUserNotificationPreferenceFilters(req: RequestWithToken): UserNotificationPreferenceFilterParams {
  return {
    userNotificationPreferenceId: asNumber(req.query.userNotificationPreferenceId),
    userId: asNumber(req.query.userId),
    type: req.query.code as string,
    channel: req.query.channel as string,
    enabled: req.query.enabled === undefined ? undefined : Boolean(req.query.enabled),
  };
}

export default class UserNotificationPreferenceService extends WithManager {
  /**
   * Parses an UserNotificationPreference Object to a BaseUserNotificationPreferenceResponse
   * @param userNotificationPreference - The UserNotificationPreference to parse
   */
  public static asResponse(userNotificationPreference: UserNotificationPreference): BaseUserNotificationPreferenceResponse {
    return {
      id: userNotificationPreference.id,
      createdAt: userNotificationPreference.createdAt.toISOString(),
      updatedAt: userNotificationPreference.updatedAt.toISOString(),
      user: parseUserToBaseResponse(userNotificationPreference.user, false),
      type: userNotificationPreference.type,
      channel: userNotificationPreference.channel,
      enabled: userNotificationPreference.enabled,
    };
  }

  public static toArrayResponse(userNotificationPreferences: UserNotificationPreference[]): BaseUserNotificationPreferenceResponse[] {
    return userNotificationPreferences.map(userPreference => UserNotificationPreferenceService.asResponse(userPreference));
  }

  /**
   * Creates an UserNotificationPreference from an UserNotificationPreferenceRequest
   * @param requestParams
   */
  public async createUserNotificationPreference(requestParams: UserNotificationPreferenceRequestParams): Promise<UserNotificationPreference> {
    const { userId, type, channel, enabled } = requestParams;
    const user = await this.manager.findOne(User, { where: { id: userId } });

    const newUserNotificationPreference: UserNotificationPreference = Object.assign(new UserNotificationPreference(), {
      userId: userId,
      user: user,
      type: type,
      channel: channel,
      enabled: enabled,
    });

    await this.manager.save(newUserNotificationPreference);

    const options = UserNotificationPreferenceService.getOptions({ userNotificationPreferenceId: newUserNotificationPreference.id });
    return this.manager.findOne(UserNotificationPreference, options);
  }

  /**
   * Returns UserNotificationPreferences based on the given filter params
   * @param params
   */
  public async getUserNotificationPreferences(params: UserNotificationPreferenceFilterParams = {}): Promise<UserNotificationPreference[]> {
    const options = { ...UserNotificationPreferenceService.getOptions(params) };

    return this.manager.find(UserNotificationPreference, { ...options });
  }

  /**
   * Returns all UserNotificationPreferences based on given params
   * @param params
   * @param pagination - The pagination to apply
   */
  public async getPaginatedUserNotificationPreference(params: UserNotificationPreferenceFilterParams = {},
    pagination: PaginationParameters = {}): Promise<PaginatedUserNotificationPreferenceResponse> {
    const { take, skip } = pagination;
    const options = { ...UserNotificationPreferenceService.getOptions(params), skip, take };

    const userNotificationPreferences = await this.manager.find(UserNotificationPreference, { ...options, take });

    const records = UserNotificationPreferenceService.toArrayResponse(userNotificationPreferences);

    const count = await this.manager.count(UserNotificationPreference, options);
    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  /**
   * Updates the UserNotificationPreference
   *
   * It is only possible to change the enabled boolean in the database.
   *
   * @param update
   */
  public async updateUserNotificationPreference(update: UserNotificationPreferenceUpdateParams): Promise<UserNotificationPreference> {
    const { userNotificationPreferenceId, enabled } = update;
    const base: UserNotificationPreference = await this.manager.findOne(
      UserNotificationPreference, UserNotificationPreferenceService.getOptions({ userNotificationPreferenceId },
      ));

    if (!base) {
      return undefined;
    }

    await this.manager.update(UserNotificationPreference, { id: base.id }, { enabled: enabled });

    const options = UserNotificationPreferenceService.getOptions({ userNotificationPreferenceId: base.id });
    return this.manager.findOne(UserNotificationPreference, options);
  }

  /**
   * Sync all users with all types of notification and channels
   */
  public async syncAllUserNotificationPreferences(): Promise<void> {
    const allCombinations: { type: NotificationTypes; channel: NotificationChannels }[]  = [];
    for (const type of Object.values(NotificationTypes)) {
      for (const channel of Object.values(NotificationChannels)) {
        allCombinations.push({ type, channel });
      }
    }

    const users = await this.manager.find(User);
    for (const user of users) {
      const userPreferences = await new UserNotificationPreferenceService().getUserNotificationPreferences({ userId: user.id });
      
      const missingCombinations = allCombinations.filter(combo =>
        !userPreferences.some(up => up.type === combo.type && up.channel === combo.channel),
      );

      if (missingCombinations.length > 0) {
        await Promise.all(
          missingCombinations.map(combo =>
            new UserNotificationPreferenceService().createUserNotificationPreference({
              userId: user.id,
              type: combo.type,
              channel: combo.channel,
              enabled: false,
            }),
          ),
        );
      }
    }
  }

  public static getOptions(params: UserNotificationPreferenceFilterParams): FindManyOptions<UserNotificationPreference> {
    const filterMapping = {
      userNotificationPreferenceId: 'id',
      userId: 'userId',
      type: 'type',
      channel: 'channel',
      enabled: 'enabled',
    };

    const relations: FindOptionsRelations<UserNotificationPreference> = {
      user: true,
    };

    const options: FindManyOptions<UserNotificationPreference> = {
      where: {
        ...QueryFilter.createFilterWhereClause(filterMapping, params),
      },
      order: { createdAt: 'DESC' },
    };

    return { ...options, relations };
  }

}