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
 * This is the module page of the transfer-controller.
 *
 * @module transfers
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import TransferService, { parseGetTransferAggregateFilters, parseGetTransferFilters, parseGetTransferSummaryFilters } from '../service/transfer-service';
import TransferRequest from './request/transfer-request';
import Transfer from '../entity/transactions/transfer';
import { parseRequestPagination, toResponse } from '../helpers/pagination';
import userTokenInOrgan from '../helpers/token-helper';
import { PdfError } from '../errors';

export default class TransferController extends BaseController {
  private logger: Logger = log4js.getLogger('TransferController');

  /**
   * Creates a new transfer controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  getPolicy(): Policy {
    return {
      '/aggregate': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transfer', ['*']),
          handler: this.returnTransferAggregate.bind(this),
        },
      },
      '/summary': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transfer', ['*']),
          handler: this.returnTransferSummary.bind(this),
        },
      },
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transfer', ['*']),
          handler: this.returnAllTransfers.bind(this),
        },
        POST: {
          body: { modelName: 'TransferRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Transfer', ['*']),
          handler: this.postTransfer.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await TransferController.getRelation(req), 'Transfer', ['*']),
          handler: this.returnTransfer.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', await TransferController.getRelation(req), 'Transfer', ['*']),
          handler: this.deleteTransfer.bind(this),
        },
      },
      '/:id(\\d+)/pdf': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await TransferController.getRelation(req), 'Transfer', ['*']),
          handler: this.getTransferPdf.bind(this),
        },
      },
    };
  }

  /**
   * Function to determine which credentials are needed to get transaction
   *        all if user is not connected to transaction
   *        own if user is connected to transaction
   *        organ if user is connected to transaction via organ
   * @param req
   * @return whether transaction is connected to used token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const transfer = await Transfer.findOne({ where: { id: parseInt(req.params.id, 10) }, relations: ['to', 'from'] });
    if (!transfer) return 'all';
    const fromId = transfer.from != null ? transfer.from.id : undefined;
    const toId = transfer.to != null ? transfer.to.id : undefined;
    if (userTokenInOrgan(req, fromId) || userTokenInOrgan(req, toId)) return 'organ';
    if (transfer
      && (fromId === req.token.user.id
      || toId === req.token.user.id)) {
      return 'own';
    }
    return 'all';
  }

  /**
   * GET /transfers/aggregate
   * @summary Returns the aggregate (sum and count) of transfers matching the given filters
   * @operationId getTransferAggregate
   * @tags transfers - Operations of transfer controller
   * @security JWT
   * @param {string} fromDate.query - Start date for selected transfers (inclusive)
   * @param {string} tillDate.query - End date for selected transfers (exclusive)
   * @param {integer} fromId.query - Filter transfers from this user ID
   * @param {integer} toId.query - Filter transfers to this user ID
   * @param {string} category.query - Restrict to a specific transfer category: deposit, payoutRequest, sellerPayout, invoice, creditInvoice, fine, waivedFines, writeOff, inactiveAdministrativeCost
   * @return {TransferAggregateResponse} 200 - Aggregate sum and count of matching transfers
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnTransferAggregate(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get transfer aggregate by user', req.token.user);

    let filters;
    try {
      filters = parseGetTransferAggregateFilters(req);
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const { total, count } = await new TransferService().getTransferAggregate(filters);
      res.json({ total: total.toObject(), count });
    } catch (error) {
      this.logger.error('Could not return transfer aggregate:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /transfers/summary
   * @summary Returns an aggregate breakdown of transfers for every category plus an overall total
   * @operationId getTransferSummary
   * @tags transfers - Operations of transfer controller
   * @security JWT
   * @param {string} fromDate.query - Start date for selected transfers (inclusive)
   * @param {string} tillDate.query - End date for selected transfers (exclusive)
   * @param {integer} fromId.query - Filter transfers from this user ID
   * @param {integer} toId.query - Filter transfers to this user ID
   * @return {TransferSummaryResponse} 200 - Per-category aggregate sums and counts
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnTransferSummary(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get transfer summary by user', req.token.user);

    let filters;
    try {
      filters = parseGetTransferSummaryFilters(req);
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const summary = await new TransferService().getTransferSummary(filters);
      res.json({
        total: { total: summary.total.total.toObject(), count: summary.total.count },
        deposits: { total: summary.deposits.total.toObject(), count: summary.deposits.count },
        payoutRequests: { total: summary.payoutRequests.total.toObject(), count: summary.payoutRequests.count },
        sellerPayouts: { total: summary.sellerPayouts.total.toObject(), count: summary.sellerPayouts.count },
        invoices: { total: summary.invoices.total.toObject(), count: summary.invoices.count },
        creditInvoices: { total: summary.creditInvoices.total.toObject(), count: summary.creditInvoices.count },
        fines: { total: summary.fines.total.toObject(), count: summary.fines.count },
        waivedFines: { total: summary.waivedFines.total.toObject(), count: summary.waivedFines.count },
        writeOffs: { total: summary.writeOffs.total.toObject(), count: summary.writeOffs.count },
        inactiveAdministrativeCosts: { total: summary.inactiveAdministrativeCosts.total.toObject(), count: summary.inactiveAdministrativeCosts.count },
        manualCreations: { total: summary.manualCreations.total.toObject(), count: summary.manualCreations.count },
        manualDeletions: { total: summary.manualDeletions.total.toObject(), count: summary.manualDeletions.count },
      });
    } catch (error) {
      this.logger.error('Could not return transfer summary:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /transfers
   * @summary Returns all existing transfers
   * @operationId getAllTransfers
   * @tags transfers - Operations of transfer controller
   * @security JWT
   * @param {string} fromDate.query - Start date for selected transfers (inclusive)
   * @param {string} tillDate.query - End date for selected transfers (exclusive)
   * @param {integer} fromId.query - Filter transfers from this user ID
   * @param {integer} toId.query - Filter transfers to this user ID
   * @param {string} category.query - Restrict to a specific transfer category: deposit, payoutRequest, sellerPayout, invoice, creditInvoice, fine, waivedFines, writeOff, inactiveAdministrativeCost, manualCreation, manualDeletion
   * @param {integer} take.query - How many transfers the endpoint should return
   * @param {integer} skip.query - How many transfers should be skipped (for pagination)
   * @return {Array.<TransferResponse>} 200 - All existing transfers
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnAllTransfers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all transfers by user', body, 'by user', req.token.user);

    let filters;
    let take;
    let skip;
    try {
      filters = parseGetTransferFilters(req);
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const [transfers, count] = await new TransferService().getTransfers(filters, { take, skip });
      const records = transfers.map((t) => TransferService.asTransferResponse(t));
      res.json(toResponse(records, count, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all transfers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /transfers/{id}
   * @summary Returns the requested transfer
   * @operationId getSingleTransfer
   * @tags transfers - Operations of transfer controller
   * @param {integer} id.path.required - The id of the transfer which should be returned
   * @security JWT
   * @return {TransferResponse} 200 - The requested transfer entity
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async returnTransfer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single transfer', id, 'by user', req.token.user);
    try {
      const parsedId = parseInt(id, 10);
      const [transfers] = await new TransferService().getTransfers({ id: parsedId }, {});
      if (transfers.length > 0) {
        res.json(TransferService.asTransferResponse(transfers[0]));
      } else {
        res.status(404).json('Transfer not found.');
      }
    } catch (error) {
      this.logger.error('Could not return transfer:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /transfers
   * @summary Post a new transfer.
   * @operationId createTransfer
   * @tags transfers - Operations of transfer controller
   * @param {TransferRequest} request.body.required
   * - The transfer which should be created
   * @security JWT
   * @return {TransferResponse} 200 - The created transfer entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async postTransfer(req: RequestWithToken, res: Response) : Promise<void> {
    const request = req.body as TransferRequest;
    this.logger.trace('Post transfer', request, 'by user', req.token.user);

    const transferService = new TransferService();

    try {
      if (!(await transferService.verifyTransferRequest(request))) {
        res.status(400).json('Invalid transfer.');
        return;
      }

      const transfer = await transferService.postTransfer(request);
      res.json(TransferService.asTransferResponse(transfer));
    } catch (error) {
      this.logger.error('Could not create transfer:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
     * DELETE /transfers/{id}
     * @summary Deletes a transfer.
     * @operationId deleteTransfer
     * @tags transfers - Operations of transfer controller
     * @param {integer} id.path.required - The id of the transfer which should be deleted
     * @security JWT
     * @return 204 - Transfer successfully deleted
     * @return {string} 400 - Cannot delete transfer because it is referenced by another entityreturn
     * @return {string} 404 - Not found error
     */
  public async deleteTransfer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete transfer', id, 'by user', req.token.user);

    try {
      await new TransferService().deleteTransfer(parseInt(id));
      res.status(204).send();
    } catch (error) {
      if (error.message === 'Transfer not found') {
        res.status(404).json('Transfer not found.');
      } else if (error.message === 'Cannot delete transfer because it is referenced by another entity') {
        res.status(400).json('Cannot delete transfer because it is referenced by another entity.');
      } else {
        this.logger.error('Could not delete transfer:', error);
        res.status(500).json('Internal server error.');
      }
    }
  }

  /**
   * GET /transfers/{id}/pdf
   * @summary Get the PDF of the transfer
   * @operationId getTransferPdf
   * @tags transfers - Operations of the transfer controller
   * @param {integer} id.path.required - The transfer ID
   * @security JWT
   * @returns {string} 200 - The requested pdf of the transfer - application/pdf
   * @return {string} 400 - Transfer is decorated and has its own PDF service
   * @return {string} 404 - Transfer not found
   * @return {string} 500 - Internal server error
   */
  public async getTransferPdf(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const transferId = parseInt(id, 10);
    this.logger.trace('Get transfer PDF', id, 'by user', req.token.user);

    try {
      const transfer = await Transfer.findOne({
        where: { id: transferId },
      });
      if (!transfer) {
        res.status(404).json('Transfer not found.');
        return;
      }

      const pdf = await transfer.createPdf();
      const fileName = `transfer-${transfer.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(pdf);
    } catch (error: any) {
      if (error instanceof PdfError) {
        res.status(400).json(error.message);
        return;
      }
      this.logger.error('Could not return transfer PDF:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
