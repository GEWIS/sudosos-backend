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
 * This is the module page of the server-settings-controller.
 *
 * @module internal/server-settings
 */

import BaseController, { BaseControllerOptions } from './base-controller';
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import ServerSettingsStore from '../server-settings/server-settings-store';
import WebSocketService from '../service/websocket-service';
import { asBoolean } from '../helpers/validators';

/**
 * @typedef {object} UpdateMaintenanceModeRequest
 * @property {boolean} enabled.required - Whether maintenance mode should be enabled or disabled
 */
interface UpdateMaintenanceModeRequest {
  enabled: boolean;
}

/**
 * @typedef {object} UpdateWrappedEnabledRequest
 * @property {boolean} enabled.required - Whether wrapped is intended to be enabled
 */
interface UpdateWrappedEnabledRequest {
  enabled: boolean;
}

/**
 * @typedef {object} WrappedEnabledResponse
 * @property {boolean} enabled.required - Whether wrapped is intended to be enabled
 */
interface WrappedEnabledResponse {
  enabled: boolean;
}

export default class ServerSettingsController extends BaseController {
  private logger: Logger = log4js.getLogger('ServerSettingsController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/maintenance-mode': {
        PUT: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Maintenance', ['*']),
          handler: this.setMaintenanceMode.bind(this),
          body: { modelName: 'UpdateMaintenanceModeRequest' },
          restrictions: { availableDuringMaintenance: true },
        },
      },
      '/wrapped-enabled': {
        GET: {
          policy: async () => true,
          handler: this.getWrappedEnabled.bind(this),
        },
        PUT: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'ServerSettings', ['wrappedEnabled']),
          handler: this.setWrappedEnabled.bind(this),
          body: { modelName: 'UpdateWrappedEnabledRequest' },
        },
      },
    };
  }

  /**
   * PUT /server-settings/maintenance-mode
   * @summary Enable/disable maintenance mode
   * @operationId setMaintenanceMode
   * @tags serverSettings - Operations of the server settings controller
   * @security JWT
   * @param {UpdateMaintenanceModeRequest} request.body.required
   * @return {string} 204 - Success.
   * @return {string} 500 - Internal server error.
   */
  public async setMaintenanceMode(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Set maintenance mode by', req.token.user);

    try {
      const body = req.body as UpdateMaintenanceModeRequest;

      const store = ServerSettingsStore.getInstance();
      await store.setSetting('maintenanceMode', body.enabled);

      // Send websocket message to POS
      WebSocketService.sendMaintenanceMode(body.enabled);

      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not update maintenance mode:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /server-settings/wrapped-enabled
   * @summary Get the wrapped-enabled server setting
   * @operationId getWrappedEnabled
   * @tags serverSettings - Operations of the server settings controller
   * @security JWT
   * @return {WrappedEnabledResponse} 200 - Success.
   * @return {string} 500 - Internal server error.
   */
  public async getWrappedEnabled(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get wrapped-enabled by', req.token.user);

    try {
      const store = ServerSettingsStore.getInstance();
      const enabled = await store.getSettingFromDatabase('wrappedEnabled');

      res.status(200).json({
        enabled,
      } as WrappedEnabledResponse);
    } catch (error) {
      this.logger.error('Could not get wrapped-enabled:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PUT /server-settings/wrapped-enabled
   * @summary Set the wrapped-enabled server setting
   * @operationId setWrappedEnabled
   * @tags serverSettings - Operations of the server settings controller
   * @security JWT
   * @param {UpdateWrappedEnabledRequest} request.body.required
   * @return {string} 204 - Success.
   * @return {string} 500 - Internal server error.
   */
  public async setWrappedEnabled(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Set wrapped-enabled by', req.token.user);

    try {
      const body = req.body as UpdateWrappedEnabledRequest;
      const enabled = asBoolean(body.enabled);

      const store = ServerSettingsStore.getInstance();
      await store.setSetting('wrappedEnabled', enabled);

      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not update wrapped-enabled:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
