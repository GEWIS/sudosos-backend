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

/**
 * This is the module page of the user-notification-preference-request
 *
 * @module notifications
 */

export interface UpdateUserNotificationPreferenceParams {
  userNotificationPreferenceId: number;
  enabled: boolean;
}

/**
 * @typedef {object} UpdateUserNotificationPreferenceRequest
 * @property {integer} userNotificationPreferenceId.required - The user notification preference id
 * @property {boolean} enabled.required - Whether the preference should be enabled or not
 */
export interface UpdateUserNotificationPreferenceRequest {
  userNotificationPreferenceId: number;
  enabled: boolean;
}

/**
 * @typedef {object} UserNotificationPreferenceRequest
 * @property {integer} userId.required - The user
 * @property {string} type.required - The notification type code
 * @property {string} channel.required - The notification channel
 * @property {boolean} enabled.required - Whether the preference is enabled
 */
export interface UserNotificationPreferenceRequest {
  userId: number;
  type: string;
  channel: string;
  enabled: boolean;
}