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
 * This is the module page of the terms-of-service-controller.
 *
 * @module terms-of-service
 */

import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import TermsOfServiceService from '../service/terms-of-service-service';

export default class TermsOfServiceController extends BaseController {
  /**
     * Reference to the logger instance.
     */
  private logger: Logger = log4js.getLogger('TermsOfServiceController');

  /**
     * Creates a new terms of service controller instance.
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
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'TermsOfService', ['*']),
          handler: this.getTOS.bind(this),
        },
      },
    };
  }

  /**
     * GET /terms-of-service
     * @summary Get a terms of service version by version number
     * @operationId getTermsOfService
     * @tags terms-of-service - Operations of terms of service controller
     * @security JWT
     * @param {string} version.query.required - The version of the terms of service to retrieve (e.g. "1.0")
     * @return {TermsOfServiceResponse} 200 - The requested terms of service version
     * @return {string} 400 - Version query parameter is required
     * @return {string} 404 - Terms of service version not found
     * @return {string} 500 - Internal server error
     */
  public async getTOS(req: Request, res: Response): Promise<void> {
    const { version } = req.query;
    if (!version) {
      res.status(400).json({ error: 'version query parameter is required' });
      return;
    }

    try {
      res.json(await TermsOfServiceService.getTermsOfService(String(version)));
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      this.logger.error('Could not get Terms of Service', error);
      res.status(500).json('Internal server error.');
    }
  }
}