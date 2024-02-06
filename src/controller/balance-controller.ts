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
import User from '../entity/user/user';
import BalanceService, { asBalanceOrderColumn, GetBalanceParameters } from '../service/balance-service';
import UserController from './user-controller';
import { asArrayOfUserTypes, asBoolean, asDate, asDinero } from '../helpers/validators';
import { asOrderingDirection } from '../helpers/ordering';
import { parseRequestPagination } from '../helpers/pagination';

export default class BalanceController extends BaseController {
  private logger: Logger = log4js.getLogger('BalanceController');

  /**
   * Creates a new balance controller instance.
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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Balance', ['*']),
          handler: this.getOwnBalance.bind(this),
        },
      },
      '/all': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Balance', ['*']),
          handler: this.getAllBalances.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', UserController.getRelation(req), 'Balance', ['*']),
          handler: this.getBalance.bind(this),
        },
      },
    };
  }

  /**
   * GET /balances
   * @summary Get balance of the current user
   * @operationId getBalances
   * @tags balance - Operations of balance controller
   * @security JWT
   * @return {BalanceResponse} 200 - The requested user's balance
   * @return {string} 400 - Validation error
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  // eslint-disable-next-line class-methods-use-this
  private async getOwnBalance(req: RequestWithToken, res: Response): Promise<void> {
    try {
      res.json(await BalanceService.getBalance(req.token.user.id));
    } catch (error) {
      this.logger.error(`Could not get balance of user with id ${req.token.user.id}`, error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /balances/all
   * @summary Get balance of the current user
   * @operationId getAllBalance
   * @tags balance - Operations of balance controller
   * @security JWT
   * @param {string} date.query - Timestamp to get balances for
   * @param {integer} minBalance.query - Minimum balance
   * @param {integer} maxBalance.query - Maximum balance
   * @param {boolean} hasFine.query - Only users with(out) fines
   * @param {integer} minFine.query - Minimum fine
   * @param {integer} maxFine.query - Maximum fine
   * @param {Array<string|number>} userTypes.query - enum:MEMBER,ORGAN,VOUCHER,LOCAL_USER,LOCAL_ADMIN,INVOICE,AUTOMATIC_INVOICE - Filter based on user type.
   * @param {string} orderBy.query - Column to order balance by - eg: id,amount
   * @param {string} orderDirection.query - enum:ASC,DESC - Order direction
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @return {Array<BalanceResponse>} 200 - The requested user's balance
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  private async getAllBalances(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all balances by', req.token.user);

    let params: GetBalanceParameters;
    let take;
    let skip;
    try {
      params = {
        date: asDate(req.query.date),
        minBalance: asDinero(req.query.minBalance),
        maxBalance: asDinero(req.query.maxBalance),
        hasFine: asBoolean(req.query.hasFine),
        minFine: asDinero(req.query.minFine),
        maxFine: asDinero(req.query.maxFine),
        userTypes: asArrayOfUserTypes(req.query.userTypes),
        orderBy: asBalanceOrderColumn(req.query.orderBy),
        orderDirection: asOrderingDirection(req.query.orderDirection),
      };
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (error) {
      res.status(400).json(error.message);
      return;
    }

    try {
      const result = await BalanceService.getBalances(params, { take, skip });
      res.json(result);
    } catch (error) {
      this.logger.error('Could not get balances', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /balances/{id}
   * @summary Retrieves the requested balance
   * @operationId getBalanceId
   * @tags balance - Operations of balance controller
   * @param {integer} id.path.required - The id of the user for which the saldo is requested
   * @security JWT
   * @return {BalanceResponse} 200 - The requested user's balance
   * @return {string} 400 - Validation error
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  private async getBalance(req: RequestWithToken, res: Response): Promise<void> {
    try {
      const userId = Number.parseInt(req.params.id, 10);
      if (await User.findOne({ where: { id: userId, deleted: false } })) {
        res.json(await BalanceService.getBalance(userId));
      } else {
        res.status(404).json('User does not exist');
      }
    } catch (error) {
      const id = req?.params?.id ?? req.token.user.id;
      this.logger.error(`Could not get balance of user with id ${id}`, error);
      res.status(500).json('Internal server error.');
    }
  }
}
