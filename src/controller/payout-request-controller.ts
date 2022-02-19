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
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination } from '../helpers/pagination';
import PayoutRequestService, { parseGetPayoutRequestsFilters } from '../service/payout-request-service';

export default class PayoutRequestController extends BaseController {
  private logger: Logger = log4js.getLogger('PayoutRequestController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'payoutRequest', ['*']),
          handler: this.returnAllPayoutRequests.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          // TODO: Users should be able to get the details of their own payout requests
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'payoutRequest', ['*']),
          handler: this.returnSinglePayoutRequest.bind(this),
        },
      },
    };
  }

  /**
   * Returns all payout requests given the filter parameters
   * @route GET /payoutrequests
   * @group payoutRequests - Operations of the payout request controller
   * @security JWT
   * @param {integer | Array<integer>} requestedById.query - ID of user(s) who requested a payout
   * @param {integer | Array<integer>} approvedById.query - ID of user(s) who approved a payout
   * @param {string} fromDate.query - Start date for selected transactions (inclusive)
   * @param {string} tillDate.query - End date for selected transactions (exclusive)
   * @param {Array<string>} status.query Status of the payout requests (OR relation)
   * @param {integer} take.query - How many payout requests the endpoint should return
   * @param {integer} skip.query - How many payout requests should be skipped (for pagination)
   * @returns {PaginatedBasePayoutRequestResponse.model} 200 - All existing payout requests
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async returnAllPayoutRequests(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all payout requests by user', req.token.user);

    let filters;
    let pagination;
    try {
      filters = parseGetPayoutRequestsFilters(req);
      pagination = parseRequestPagination(req);
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const results = await PayoutRequestService.getPayoutRequests(filters, pagination);
      res.status(200).json(results);
    } catch (e) {
      res.status(500).send('Internal server error.');
      this.logger.error(e);
    }
  }

  /**
   * Get a single payout request
   * @route GET /payoutrequests/{id}
   * @group payoutRequests - Operations of the payout request controller
   * @param {integer} id.path.required - The ID of the payout request object that should be returned
   * @security JWT
   * @returns {PayoutRequestResponse.model} 200 - Single payout request with given id
   * @returns {string} 404 - Nonexistent payout request id
   */
  public async returnSinglePayoutRequest(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get single payout request', parameters, 'by user', req.token.user);

    let payoutRequest;
    try {
      payoutRequest = await PayoutRequestService
        .getSinglePayoutRequest(parseInt(parameters.id, 10));
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
      return;
    }

    if (payoutRequest === undefined) {
      res.status(404).json('Unknown payout request ID.');
      return;
    }

    res.status(200).json(payoutRequest);
  }
}
