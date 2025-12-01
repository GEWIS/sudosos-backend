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

import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import UserNotificationPreferenceService, {
  parseUserNotificationPreferenceFilters,
  UserNotificationPreferenceFilterParams,
} from '../service/user-notification-preference-service';
import { parseRequestPagination } from '../helpers/pagination';
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import UserNotificationPreference from '../entity/notifications/user-notification-preference';
import {
  UserNotificationPreferenceUpdateParams,
  UserNotificationPreferenceUpdateRequest,
} from './request/user-notification-preference-request';
import { asNumber } from '../helpers/validators';

/**
 * This is the module page of the notification-service.
 *
 * @module notifications
 *
 */

export default class UserNotificationController extends BaseController {
  /**
     * Reference to the logger instance
     */
  private logger: Logger = log4js.getLogger('UserNotificationPreferenceController');

  /**
     * Creates a new UserNotificationPreference controller instance
     * @param options - The options passed to the base controller.
     */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
     * @inheritDoc
     */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await UserNotificationController.filterRelation(req), 'UserNotificationPreference', ['*']),
          handler: this.getAllUserNotificationPreferences.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await UserNotificationController.getRelation(req), 'UserNotificationPreference', ['*']),
          handler: this.getSingleUserNotificationPreference.bind(this),
        },
        PATCH: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', await UserNotificationController.getRelation(req), 'UserNotificationPreference', ['*']),
          handler: this.updateUserNotificationPreference.bind(this),
        },
      },
    };
  }

  /**
     * GET /user-notification-preferences
     * @summary Returns all user notification preferences in the system.
     * @operationId getAllUserNotificationPreferences
     * @tags userNotificationPreferences - Operations of the user notification preference controller
     * @security JWT
     * @param {integer} userNotificationPreferenceId.query - Filter on the user notification preference id
     * @param {integer} userId.query - Filter on the user id
     * @param {string} type.query - Filter on the notification type
     * @param {string} channel.query - Filter on the notification channel
     * @param {boolean} enabled.query - Filter on enabled preferences
     * @return {PaginatedUserNotificationPreferenceResponse} 200 - All existing invoices
     * @return {string} 400 - Validation error
     * @return {string} 500 - Internal server error
     */
  public async getAllUserNotificationPreferences(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all user notification preferences', body, 'by user', req.token.user);

    let take;
    let skip;
    let filters: UserNotificationPreferenceFilterParams;

    try {
      const pagination = parseRequestPagination(req);
      filters = parseUserNotificationPreferenceFilters(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const userNotificationPreferences = await new UserNotificationPreferenceService().getPaginatedUserNotificationPreference(
        filters, { take, skip },
      );
      res.json(userNotificationPreferences);
    } catch (e) {
      this.logger.error('Could not return all user notification preferences', e);
      res.status(500).json('Internal server error');
    }
  }

  /**
     * GET /user-notification-preferences/{id}
     * @summary Return a single user notification preferences in the system.
     * @operationId getSingleUserNotificationPreference
     * @tags userNotificationPreferences - Operations of the user notification preference controller
     * @security JWT
     * @param {integer} id.path.required - The id of the user notification preference
     * @return {BaseUserNotificationPreferenceResponse} 200 - The existing user notification preference
     * @return {string} 404 - User notification preference not found
     * @return {string} 500 - Internal server error
     */
  public async getSingleUserNotificationPreference(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const userNotificationPreferenceId = parseInt(id, 10);
    this.logger.trace('Get user notification preferences', userNotificationPreferenceId, 'by user', req.token.user);

    try {
      const userNotificationPreferences: UserNotificationPreference[] = await new UserNotificationPreferenceService().getUserNotificationPreferences(
        { userNotificationPreferenceId },
      );

      const userNotificationPreference = userNotificationPreferences[0];
      if (!userNotificationPreference) {
        res.status(404).send('Unknown user notification preference ID.');
        return;
      }

      const response = UserNotificationPreferenceService.asResponse(userNotificationPreference);

      res.json(response);
    } catch (e) {
      this.logger.error('Could not return user notification preferences', e);
      res.status(500).json('Internal server error');
    }
  }

  /**
     * PATCH /user-notification-preferences/{id}
     * @summary Update a user notification preferences in the system.
     * @operationId updateUserNotificationPreference
     * @tags userNotificationPreferences - Operations of the user notification preference controller
     * @security JWT
     * @param {integer} id.path.required - The id of the user notification preference
     * @param {UserNotificationPreferenceUpdateRequest} request.body.required -
     * The user notification preference update to process
     * @return {BaseUserNotificationPreferenceResponse} 200 - The existing user notification preference
     * @return {string} 404 - User notification preference not found
     * @return {string} 500 - Internal server error
     */
  public async updateUserNotificationPreference(req: RequestWithToken, res: Response): Promise<void> {
    const body  = req.body as UserNotificationPreferenceUpdateRequest;
    const { id } = req.params;
    const userNotificationPreferenceId = parseInt(id, 10);
    this.logger.trace('Update user notification preferences', userNotificationPreferenceId, 'by user', req.token.user);

    try {
      const params: UserNotificationPreferenceUpdateParams = {
        ...body,
        userNotificationPreferenceId,
      };

      const userNotificationPreference = await new UserNotificationPreferenceService().updateUserNotificationPreference(
        params,
      );

      if (!userNotificationPreference) {
        res.status(404).send('Unknown user notification preference ID.');
        return;
      }

      const response = UserNotificationPreferenceService.asResponse(userNotificationPreference);

      res.json(response);
    } catch (e) {
      this.logger.error('Could not update user notification preferences', e);
      res.status(500).json('Internal server error');
    }
  }

  /**
   * Determines the relation between the user and the notification preference.
   * - Returns own if user is connected to the notification preference
   * - Returns all otherwise.
   * @param req - Express request with user token and filters in query params.
   * @returns 'own' | 'all'
   */
  static async filterRelation(
    req: RequestWithToken,
  ): Promise<'own' | 'all'> {
    try {
      const reqUserId = req.token.user.id;
      const { userId } = parseUserNotificationPreferenceFilters(req);

      if (reqUserId == userId) {
        return 'own';
      }

      return 'all';
    } catch (e) {
      return 'all';
    }
  }

  /**
   * Determines which credentials are needed to get user notification preferences
   *    all if user is not connected to user notification preference
   *    own if user is connected to the notification preference
   * @param req - Request with transaction id as param
   * @return whether transaction is connected to user token
   */
  static async getRelation(
    req: RequestWithToken,
  ): Promise<'all' | 'own'> {

    const preference = await UserNotificationPreference.findOne({
      where: { id: asNumber(req.params.id) },
      relations: ['user'],
    });

    if (!preference) return 'all';

    if (preference.userId == req.token.user.id) return 'own';

    return 'all';
  }
}