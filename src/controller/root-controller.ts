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

import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { parseRequestPagination } from '../helpers/pagination';
import BannerService from '../service/banner-service';
import ServerSettingsStore from '../server-settings/server-settings-store';

/**
 * @typedef {object} ServerStatusReponse
 * @property {boolean} maintenanceMode.required - Whether the server is in maintenance mode
 */
interface ServerStatusResponse {
  maintenanceMode: boolean;
}

export default class RootController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: Logger = log4js.getLogger('RootController');

  /**
   * Creates a new root controller instance.
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
      '/ping': {
        GET: {
          policy: async () => Promise.resolve(true),
          handler: this.ping.bind(this),
          restrictions: { availableDuringMaintenance: true },
        },
      },
      '/open/banners': {
        GET: {
          policy: async () => true,
          handler: this.returnAllBanners.bind(this),
        },
      },
    };
  }

  /**
   * GET /open/banners
   * @summary Returns all existing banners
   * @operationId getAllOpenBanners
   * @tags banners - Operations of banner controller
   * @param {integer} take.query - How many banners the endpoint should return
   * @param {integer} skip.query - How many banners should be skipped (for pagination)
   * @return {PaginatedBannerResponse} 200 - All existing banners
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnAllBanners(req: Request, res: Response): Promise<void> {
    this.logger.trace('Get all banners by', req.ip);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      res.json(await BannerService.getBanners({}, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all banners:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /ping
   * @summary Get the current status of the backend
   * @operationId ping
   * @tags root - Operations of the root controller
   * @return {ServerStatusResponse} 200 - Success
   * @return {string} 500 - Internal server error
   */
  public async ping(req: Request, res: Response): Promise<void> {
    this.logger.trace('Ping by', req.ip);

    try {
      const store = ServerSettingsStore.getInstance();
      const maintenanceMode = await store.getSettingFromDatabase('maintenanceMode');
      res.status(200).json({
        maintenanceMode,
      });
    } catch (e) {
      res.status(500).json('Internal server error.');
    }
  }
}
