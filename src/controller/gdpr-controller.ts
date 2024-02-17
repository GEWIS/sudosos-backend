/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
import BaseController, { BaseControllerOptions } from './base-controller';
import log4js, { Logger } from 'log4js';
import Policy from './policy';
import { GdprResponse } from './response/gdpr-response';
import User from '../entity/user/user';
import { RequestWithToken } from '../middleware/token-middleware';
import { Response } from 'express';
import GdprService from '../service/gdpr-service';

export default class GdprController extends BaseController {
  private logger: Logger = log4js.getLogger('GdprLogger');

  /**
   * Creates a new gdpr controller instance.
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
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'GDPR', ['*']),
          handler: this.getGdprResponse.bind(this),
        },
      },
    };
  }

  /**
   * GET /gdpr/{id}
   * @summary Returns the requested users data
   * @operationId getGdprResponse
   * @tags gdpr - Operations of the gdpr controller
   * @security JWT
   * @param {string} id.path.required - id of user that needs GDPR response
   * @return {GdprResponse} 200 - Response with all users data
   * @return {string} 404 - User not found
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async getGdprResponse(req: RequestWithToken, res: Response): Promise<GdprResponse> {
    const { id } = req.params;
    try {
      const user = await User.findOne({ where: { id: Number(id) } });
      if (user == null) {
        res.status(404).send();
        return;
      }

      const gdpr = await new GdprService(user).getGdprResponse();
      res.json(gdpr);
    } catch (error) {
      this.logger.error('Could not create GDPR response:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
