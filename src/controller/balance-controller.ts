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
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { UserType } from '../entity/user/user';
import BalanceService from '../service/balance-service';

export default class BalanceController extends BaseController {
  private logger: Logger = log4js.getLogger('BannerController');

  /**
   * Creates a new banner controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
     * @inheritdoc
     */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: this.canAccess.bind(this),
          handler: this.getOwnBalance.bind(this),
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
   * Get balance of the current user
   * @route get /balances
   * @group balance - Operations of balance controller
   * @security JWT
   * @returns {Number} 200 - The requested user's balance
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  // eslint-disable-next-line class-methods-use-this
  private async getOwnBalance(req: RequestWithToken, res: Response): Promise<void> {
    return this.getBalance(req, res);
  }

  /**
   * Retrieves the requested balance
   * @route get /balances/{id}
   * @group balance - Operations of balance controller
   * @param {integer} id.path.optional - The id of the user for which the saldo is requested
   * @security JWT
   * @returns {Number} 200 - The requested user's balance
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  // eslint-disable-next-line class-methods-use-this
  private async getBalance(req: RequestWithToken, res: Response): Promise<void> {
    if (req?.params?.id === undefined) {
      res.json(await BalanceService.getBalance(req.token.user.id));
    } else {
      res.json(await BalanceService.getBalance(+req.params.id));
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private async getBalances(): Promise<void> {
    // TODO: Make dependent on user service
  }

  /**
     * Validates that the request is authorized by the policy.
     * @param req - The incoming request.
     */
  // eslint-disable-next-line class-methods-use-this
  private isAdmin(req: RequestWithToken): boolean {
    return req.token.user.type === UserType.LOCAL_ADMIN;
  }

  private canAccess(req: RequestWithToken): boolean {
    return (req?.params?.id && +req.params.id === req.token.user.id)
     || this.isAdmin(req) || req?.params?.id === undefined;
  }
}
