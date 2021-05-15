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
import log4js, { Logger } from 'log4js';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Response } from 'express';
import BaseController from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { UserType } from '../entity/user/user';

export default class BalanceController extends BaseController {
  private logger: Logger = log4js.getLogger('BannerController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
     * @inheritdoc
     */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: this.isAdmin.bind(this),
          handler: this.getBalances.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: this.canAccess.bind(this),
          handler: this.getBalance.bind(this),
        },
      },
    };
  }

  /**
   * Updates the requested banner
   * @route get /balance/{id}
   * @group balance - Operations of balance controller
   * @param {integer} id.path.required - The id of the user for which the saldo is requested
   * @security JWT
   * @returns {Number} 200 - The requested user's balance
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  // eslint-disable-next-line class-methods-use-this
  private async getBalance(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.info(id);
    res.json(+id);
  }

  // eslint-disable-next-line class-methods-use-this
  private async getBalances(): Promise<Number> {
    return 5;
  }

  /**
     * Validates that the request is authorized by the policy.
     * @param req - The incoming request.
     */
  // eslint-disable-next-line class-methods-use-this
  private async isAdmin(req: RequestWithToken): Promise<boolean> {
    // TODO: check whether user is admin
    return req.token.user.type === UserType.LOCAL_ADMIN;
  }

  private async canAccess(req: RequestWithToken) {
    return (req?.params?.id && +req.params.id === req.token.user.id) || this.isAdmin(req);
  }
}
