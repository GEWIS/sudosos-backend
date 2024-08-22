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
import BaseController, { BaseControllerOptions } from './base-controller';
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination } from '../helpers/pagination';
import SellerPayoutService, { parseSellerPayoutFilters } from '../service/seller-payout-service';
import { PaginatedSellerPayoutResponse } from './response/seller-payout-response';

export default class SellerPayoutController extends BaseController {
  private logger: Logger = log4js.getLogger(' SellerPayoutController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'SellerPayout', ['*']),
          handler: this.returnAllSellerPayouts.bind(this),
        },
      },
    };
  }

  /**
   * GET /seller-payouts
   * @summary Return all seller payouts
   * @operationId getAllSellerPayouts
   * @tags SellerPayouts - Operations of the seller payout controller
   * @security JWT
   * @param {integer} requestedById.query - Requested by user ID
   * @param {string} fromDate.query - Lower bound on seller payout creation date (inclusive)
   * @param {string} tillDate.query - Upper bound on seller payout creation date (exclusive)
   * @param {integer} take.query - Number of write-offs to return
   * @param {integer} skip.query - Number of write-offs to skip
   * @return {PaginatedSellerPayoutResponse} 200 - Requested seller payouts
   * @return {string} 500 - Internal server error
   */
  public async returnAllSellerPayouts(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all seller payouts by', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const filters = parseSellerPayoutFilters(req);
      const service = new SellerPayoutService();
      const [records, count] = await service.getSellerPayouts(filters, { take, skip });

      const response: PaginatedSellerPayoutResponse = {
        records: records.map(SellerPayoutService.asSellerPayoutResponse),
        _pagination: { take, skip, count },
      };
      res.json(response);
    } catch (error) {
      this.logger.error('Could not return all seller payouts:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
