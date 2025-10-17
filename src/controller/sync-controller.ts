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
 * This is the module page of sync-controller.
 *
 * @module internal/controllers
 */

import log4js from 'log4js';
import { Response } from 'express';
import { RequestWithToken } from '../middleware/token-middleware';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import User from '../entity/user/user';
import UserSyncServiceFactory, { UserSyncServiceType } from '../service/sync/user/user-sync-service-factory';
import UserSyncManager from '../service/sync/user/user-sync-manager';
import { SyncResults } from '../service/sync/sync-manager';

/**
 * Sync controller for handling user synchronization operations.
 * Provides endpoints for dry-run sync operations to preview changes without applying them.
 */
export default class SyncController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: log4js.Logger = log4js.getLogger('SyncController');

  /**
   * Creates a new sync controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/user': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', 'all', 'User', ['*'],
          ),
          handler: this.getUserSyncResults.bind(this),
        },
      },
    };
  }

  /**
   * GET /sync/user
   * @summary Get dry-run sync results for users
   * @description Performs a dry-run synchronization of users using the specified services.
   * This endpoint always performs a dry-run and does not apply any actual database changes.
   * @operationId getUserSyncResults
   * @tags sync - Operations of the sync controller
   * @security JWT
   * @param {Array<string>} service.query - enum:LDAP,GEWISDB - Array of sync services to use (ldap, gewisdb). If not provided, all available services will be used.
   * @return {object} 200 - Dry-run sync results
   * @return {string} 400 - Bad request (invalid service parameters)
   * @return {string} 500 - Internal server error
   */
  public async getUserSyncResults(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Getting user sync results (dry-run) by', req.token.user.id);

    try {
      // Parse and validate service filter from query parameters
      let serviceFilter: UserSyncServiceType[] = [];
      if (req.query.service) {
        const services = Array.isArray(req.query.service) ? req.query.service : [req.query.service];
        for (let i = 0; i < services.length; i++) {
          if (services[i].toLowerCase === 'ldap') {
            serviceFilter.push(UserSyncServiceType.LDAP);
          } else if (services[i].toLowerCase === 'gewisdb') {
            serviceFilter.push(UserSyncServiceType.GEWISDB);
          } else {
            res.status(400).json('Invalid service: ' + services[i] + '.');
            return;
          }
        }
      }

      const syncServiceFactory = new UserSyncServiceFactory();
      const syncServices = syncServiceFactory.createSyncServices({
        roleManager: this.roleManager,
        serviceFilter,
      });

      if (syncServices.length === 0) {
        res.status(400).json('No sync services are available. Check environment configuration.');
        return;
      }

      // Create sync manager and run dry-run
      const syncManager = new UserSyncManager(syncServices);
      const results: SyncResults<User> = await syncManager.runDry();

      const toView = (user: User) => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        type: user.type,
      });

      const response = {
        users: {
          passed: results.passed.map(toView),
          failed: results.failed.map(toView),
          skipped: results.skipped.map(toView),
        },
      };

      this.logger.info(`Sync dry-run completed: ${results.passed.length} passed, ${results.failed.length} failed, ${results.skipped.length} skipped`);
      res.status(200).json(response);

    } catch (error) {
      this.logger.error('Error during sync dry-run:', error);
      res.status(500).json('Internal server error during sync operation.');
    }
  }
}
