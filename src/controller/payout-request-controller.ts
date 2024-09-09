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

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination } from '../helpers/pagination';
import PayoutRequestService, { parseGetPayoutRequestsFilters } from '../service/payout-request-service';
import { PayoutRequestStatusRequest } from './request/payout-request-status-request';
import PayoutRequest from '../entity/transactions/payout/payout-request';
import { PayoutRequestState } from '../entity/transactions/payout/payout-request-status';
import PayoutRequestRequest from './request/payout-request-request';
import User from '../entity/user/user';
import BalanceService from '../service/balance-service';
import { PdfUrlResponse } from './response/simple-file-response';
import { PdfError } from '../errors';

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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'PayoutRequest', ['*']),
          handler: this.returnAllPayoutRequests.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', await PayoutRequestController.getRelation(req), 'PayoutRequest', ['*']),
          handler: this.createPayoutRequest.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PayoutRequestController.getRelation(req), 'PayoutRequest', ['*']),
          handler: this.returnSinglePayoutRequest.bind(this),
        },
      },
      '/:id(\\d+)/pdf': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PayoutRequestController.getRelation(req), 'PayoutRequest', ['*']),
          handler: this.getPayoutRequestPdf.bind(this),
        },
      },
      '/:id(\\d+)/status': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', await PayoutRequestController.getRelation(req), 'PayoutRequest', ['*']),
          handler: this.updatePayoutRequestStatus.bind(this),
        },
      },
    };
  }

  static async getRelation(req: RequestWithToken): Promise<string> {
    if (req.body.forId != null) {
      if (req.body.forId == req.token.user.id) {
        return 'own';
      } else {
        return 'all';
      }
    }

    const { id } = req.params;
    const payoutRequest = await PayoutRequest.findOne({ where: { id: parseInt(id, 10) }, relations: ['requestedBy'] });
    return (payoutRequest != null && payoutRequest.requestedBy.id === req.token.user.id) ? 'own' : 'all';
  }

  /**
   * GET /payoutrequests
   * @summary Returns all payout requests given the filter parameters
   * @operationId getAllPayoutRequests
   * @tags payoutRequests - Operations of the payout request controller
   * @security JWT
   * @param {integer | Array<integer>} requestedById.query - ID of user(s) who requested a payout
   * @param {integer | Array<integer>} approvedById.query - ID of user(s) who approved a payout
   * @param {string} fromDate.query - Start date for selected transactions (inclusive)
   * @param {string} tillDate.query - End date for selected transactions (exclusive)
   * @param {string} status.query - Status of the payout requests (OR relation)
   * @array
   * @items.type {string}
   * @param {integer} take.query - How many payout requests the endpoint should return
   * @param {integer} skip.query - How many payout requests should be skipped (for pagination)
   * @return {PaginatedBasePayoutRequestResponse} 200 - All existing payout requests
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
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
   * GET /payoutrequests/{id}
   * @summary Get a single payout request
   * @operationId getSinglePayoutRequest
   * @tags payoutRequests - Operations of the payout request controller
   * @param {integer} id.path.required - The ID of the payout request object that should be returned
   * @security JWT
   * @return {PayoutRequestResponse} 200 - Single payout request with given id
   * @return {string} 404 - Nonexistent payout request id
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

  /**
   * POST /payoutrequests
   * @summary Create a new payout request
   * @operationId createPayoutRequest
   * @tags payoutRequests - Operations of the payout request controller
   * @param {PayoutRequestRequest} request.body.required - New payout request
   * @security JWT
   * @return {PayoutRequestResponse} 200 - The created payout request.
   * @return {string} 400 - Validation error
   */
  public async createPayoutRequest(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as PayoutRequestRequest;
    this.logger.trace('Create payout request by user', req.token.user);

    try {
      const user = await User.findOne({ where: { id: body.forId } });
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const balance = await new BalanceService().getBalance(user.id);
      if (balance.amount.amount < body.amount.amount) {
        res.status(400).json('Insufficient balance.');
        return;
      }

      const payoutRequest = await PayoutRequestService.createPayoutRequest(body, user);
      res.status(200).json(payoutRequest);
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
    }
  }

  /**
   * POST /payoutrequests/{id}/status
   * @summary Create a new status for a payout request
   * @operationId setPayoutRequestStatus
   * @tags payoutRequests - Operations of the payout request controller
   * @param {integer} id.path.required - The ID of the payout request object that should be returned
   * @param {PayoutRequestStatusRequest} request.body.required - New state of payout request
   * @security JWT
   * @return {PayoutRequestResponse} 200 - The updated payout request
   * @return {string} 400 - Validation error
   * @return {string} 404 - Nonexistent payout request id
   */
  public async updatePayoutRequestStatus(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    const body = req.body as PayoutRequestStatusRequest;
    this.logger.trace('Update single payout request status', parameters, 'by user', req.token.user);

    const id = parseInt(parameters.id, 10);

    // Check if payout request exists
    let payoutRequest;
    try {
      payoutRequest = await PayoutRequestService.getSinglePayoutRequest(id);
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
      return;
    }

    if (payoutRequest === undefined) {
      res.status(404).json('Unknown payout request ID.');
      return;
    }

    // Everyone can cancel their own payout requests, but only admins can update to other states.
    if (body.state !== PayoutRequestState.CANCELLED) {
      if (!this.roleManager.can(req.token.roles, 'update', 'all', 'PayoutRequest', ['*'])) {
        res.status(403).send('You can only cancel your own payout requests.');
        return;
      }
    } else if (payoutRequest.requestedBy.id !== req.token.user.id) {
      res.status(403).send('You can only cancel your own payout requests.');
      return;
    }

    if (body.state === PayoutRequestState.APPROVED) {
      const balance = await new BalanceService().getBalance(payoutRequest.requestedBy.id);
      if (balance.amount.amount < payoutRequest.amount.amount) {
        res.status(400).json('Insufficient balance.');
        return;
      }
    }

    // Verify validity of new status
    try {
      await PayoutRequestService.canUpdateStatus(id, body.state);
    } catch (e) {
      res.status(400).json(e);
      return;
    }

    // Execute
    try {
      payoutRequest = await PayoutRequestService.updateStatus(id, body.state, req.token.user);
      res.status(200).json(payoutRequest);
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
    }
  }


  /**
   * GET /payoutrequests/{id}/pdf
   * @summary Get a payout request pdf
   * @operationId getPayoutRequestPdf
   * @tags payoutRequests - Operations of the payout request controller
   * @security JWT
   * @param {integer} id.path.required - The ID of the payout request object that should be returned
   * @return {PdfUrlResponse} 200 - The pdf location information.
   * @return {string} 404 - Nonexistent payout request id
   * @return {string} 500 - Internal server error
   */
  public async getPayoutRequestPdf(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const payoutRequestId = parseInt(id, 10);
    this.logger.trace('Get payout request pdf', id, 'by user', req.token.user);

    try {
      const payoutRequest = await PayoutRequest.findOne({ where: { id: payoutRequestId }, relations: ['requestedBy', 'approvedBy', 'payoutRequestStatus'] });
      if (!payoutRequest) {
        res.status(404).json('Unknown payout request ID.');
        return;
      }

      const pdf = await payoutRequest.getOrCreatePdf();

      res.status(200).json({ pdf: pdf.downloadName } as PdfUrlResponse);
    } catch (error) {
      this.logger.error('Could get payout request PDF:', error);
      if (error instanceof PdfError) {
        res.status(502).json('PDF Generator service failed.');
        return;
      }
      res.status(500).json('Internal server error.');
    }
  }
}
