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
import { CreateSellerPayoutRequest, UpdateSellerPayoutRequest } from './request/seller-payout-request';
import User from '../entity/user/user';
import ReportService, { SalesReportService } from '../service/report-service';

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
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'SellerPayout', ['*']),
          handler: this.createSellerPayout.bind(this),
          body: { modelName: 'CreateSellerPayoutRequest' },
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'SellerPayout', ['*']),
          handler: this.returnSingleSellerPayout.bind(this),
        },
        PATCH: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'SellerPayout', ['*']),
          handler: this.updateSellerPayout.bind(this),
          body: { modelName: 'UpdateSellerPayoutRequest' },
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'SellerPayout', ['*']),
          handler: this.deleteSellerPayout.bind(this),
        },
      },
      '/:id(\\d+)/report': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'SellerPayout', ['*']),
          handler: this.getSellerPayoutReport.bind(this),
        },
      },
      '/:id(\\d+)/report/pdf': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'SellerPayout', ['*']),
          handler: this.getSellerPayoutReportPdf.bind(this),
        },
      },
    };
  }

  /**
   * GET /seller-payouts
   * @summary Return all seller payouts
   * @operationId getAllSellerPayouts
   * @tags sellerPayouts - Operations of the seller payout controller
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

  /**
   * GET /seller-payouts/{id}
   * @summary Get a single seller payout
   * @operationId getSingleSellerPayout
   * @tags sellerPayouts - Operations of the seller payout controller
   * @security JWT
   * @param {integer} id.path.required - ID of the seller payout that should be returned
   * @return {SellerPayoutResponse} 200 - Single seller payout with given ID
   * @return {string} 404 - Seller payout not found
   * @return {string} 500 - Internal server error
   */
  public async returnSingleSellerPayout(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get single seller payout with ID', req.params.id, 'by user', req.token.user);

    try {
      const id = Number(req.params.id);
      const service = new SellerPayoutService();
      const [[sellerPayout]] = await service.getSellerPayouts({ sellerPayoutId: id });
      if (!sellerPayout) {
        res.status(404).json('Seller Payout not found.');
        return;
      }

      res.json(SellerPayoutService.asSellerPayoutResponse(sellerPayout));
    } catch (error) {
      this.logger.error('Could not return single seller payout:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /seller-payouts/{id}/report
   * @summary Get a single seller payout's sales report
   * @operationId getSellerPayoutReport
   * @tags sellerPayouts - Operations of the seller payout controller
   * @param {integer} id.path.required - ID of the seller payout that should be returned
   * @return {ReportResponse} 200 - The sales report that belongs to the given seller payout
   * @return {string} 404 - SellerPayout not found.
   * @return {string} 500 - Internal server error.
   */
  public async getSellerPayoutReport(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get sales report for Seller Payout', id, 'by user', req.token.user);

    try {
      const sellerPayoutId = Number(req.params.id);
      const service = new SellerPayoutService();
      const [[sellerPayout]] = await service.getSellerPayouts({ sellerPayoutId });
      if (!sellerPayout) {
        res.status(404).json('Seller Payout not found.');
        return;
      }

      const report = await new SalesReportService().getReport({
        forId: sellerPayout.requestedBy.id,
        fromDate: sellerPayout.startDate,
        tillDate: sellerPayout.endDate,
      });
      res.json(ReportService.reportToResponse(report));
    } catch (error) {
      this.logger.error('Could not get sales report for seller payout:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /seller-payouts/{id}/report/pdf
   * @summary Get a single seller payout's sales report as PDF
   * @operationId getSellerPayoutReportPdf
   * @tags sellerPayouts - Operations of the seller payout controller
   * @param {integer} id.path.required - ID of the seller payout that should be returned
   * @param {boolean} force.query - Force the generation of the PDF
   * @return {PdfUrlResponse} 200 - The requested report
   * @return {string} 404 - SellerPayout not found.
   * @return {string} 500 - Internal server error.
   */
  public async getSellerPayoutReportPdf(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get sales report PDF for Seller Payout', id, 'by user', req.token.user);

    try {
      const sellerPayoutId = Number(req.params.id);
      const force = req.query.force === 'true';
      const service = new SellerPayoutService();
      const [[sellerPayout]] = await service.getSellerPayouts({ sellerPayoutId });
      if (!sellerPayout) {
        res.status(404).json('Seller Payout not found.');
        return;
      }

      const pdf = await sellerPayout.getOrCreatePdf(force);
      res.status(200).json({ pdf: pdf.downloadName });
    } catch (error) {
      this.logger.error('Could not get sales report for seller payout:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /seller-payouts
   * @summary Create a new seller payout
   * @operationId createSellerPayout
   * @tags sellerPayouts - Operations of the seller payout controller
   * @security JWT
   * @param {CreateSellerPayoutRequest} request.body.required - New seller payout
   * @return {SellerPayoutResponse} 200 - The created seller payout
   * @return {string} 400 - Validation error.
   * @return {string} 500 - Internal server error.
   */
  public async createSellerPayout(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateSellerPayoutRequest;
    this.logger.trace('Create new seller payout by', req.token.user);

    try {
      const requestedBy = await User.findOne({ where: { id: body.requestedById, deleted: false } });
      if (!requestedBy) {
        res.status(400).json('RequestedBy user not found.');
        return;
      }

      const startDate = new Date(body.startDate);
      if (isNaN(startDate.getTime())) {
        res.status(400).json('StartDate is not a valid date.');
        return;
      }
      const endDate = new Date(body.endDate);
      if (isNaN(endDate.getTime())) {
        res.status(400).json('EndDate is not a valid date.');
        return;
      }
      if (startDate.getTime() > endDate.getTime()) {
        res.status(400).json('EndDate cannot be before startDate.');
        return;
      }
      if (startDate > new Date()) {
        res.status(400).json('StartDate cannot be in the future.');
        return;
      }
      if (endDate > new Date()) {
        res.status(400).json('EndDate cannot be in the future.');
        return;
      }

      const service = new SellerPayoutService();
      const [requestedByPayouts] = await service.getSellerPayouts({
        requestedById: requestedBy.id, fromDate: startDate, tillDate: endDate,
      });
      if (requestedByPayouts.length > 0) {
        res.status(400).json(`New seller payout time window overlaps with the time windows of SellerPayouts ${requestedByPayouts.map((r) => `"${r.id}"`).join(', ')}.`);
      }

      const payout = await service.createSellerPayout({
        requestedById: requestedBy.id,
        startDate,
        endDate,
        reference: body.reference,
      });

      res.json(SellerPayoutService.asSellerPayoutResponse(payout));
    } catch (error) {
      this.logger.error('Could not create seller payout:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /seller-payouts/{id}
   * @summary Update an existing seller payout
   * @operationId updateSellerPayout
   * @tags sellerPayouts - Operations of the seller payout controller
   * @security JWT
   * @param {integer} id.path.required - ID of the seller payout that should be updated
   * @param {UpdateSellerPayoutRequest} request.body.required - Updated seller payout
   * @return {SellerPayoutResponse} 200 - The updated seller payout
   * @return {string} 400 - Validation error.
   * @return {string} 404 - Seller payout not found.
   * @return {string} 500 - Internal server error.
   */
  public async updateSellerPayout(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateSellerPayoutRequest;
    const { id } = req.params;
    this.logger.trace('Update seller payout', id, 'by user', req.token.user);

    try {
      const sellerPayoutId = Number(req.params.id);
      const service = new SellerPayoutService();
      let [[sellerPayout]] = await service.getSellerPayouts({ sellerPayoutId: sellerPayoutId });
      if (!sellerPayout) {
        res.status(404).json('Seller Payout not found.');
        return;
      }

      sellerPayout = await service.updateSellerPayout(sellerPayoutId, body);
      res.json(SellerPayoutService.asSellerPayoutResponse(sellerPayout));
    } catch (error) {
      this.logger.error('Could not update seller payout:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /seller-payouts/{id}
   * @summary Delete an existing seller payout
   * @operationId deleteSellerPayout
   * @tags sellerPayouts - Operations of the seller payout controller
   * @security JWT
   * @param {integer} id.path.required - ID of the seller payout that should be updated
   * @return {string} 204 - Success
   * @return {string} 404 - Seller payout not found.
   * @return {string} 500 - Internal server error.
   */
  public async deleteSellerPayout(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete seller payout', id, 'by user', req.token.user);

    try {
      const sellerPayoutId = Number(req.params.id);
      const service = new SellerPayoutService();
      let [[sellerPayout]] = await service.getSellerPayouts({ sellerPayoutId: sellerPayoutId });
      if (!sellerPayout) {
        res.status(404).json('Seller Payout not found.');
        return;
      }

      await service.deleteSellerPayout(sellerPayoutId);
      res.status(204).json(null);
    } catch (error) {
      this.logger.error('Could not delete seller payout:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
