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

import { BaseUserResponse } from './user-response';
import { PaginationResult } from '../../helpers/pagination';
import BaseResponse from './base-response';

/**
 * @typedef {allOf|object} BaseUserNotificationPreferenceResponse
 * @property {BaseUserResponse} user - The user this preference belongs to
 * @property {string} type - The notification type
 * @property {string} channel - The notification channel
 * @property {boolean} enabled - Whether the preference is enabled
 */
export interface BaseUserNotificationPreferenceResponse extends BaseResponse {
  user: BaseUserResponse;
  type: string;
  channel: string;
  enabled: boolean;
}

/**
 * @typedef {object} PaginatedUserNotificationPreferenceResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<BaseUserNotificationPreferenceResponse>} records.required - Returned UserNotificationPreference
 */
export interface PaginatedUserNotificationPreferenceResponse {
  _pagination: PaginationResult;
  records: BaseUserNotificationPreferenceResponse[];
}