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
import TransferService, { parseGetTransferFilters } from '../service/transfer-service';
import TransferRequest from './request/transfer-request';
import Transfer from '../entity/transactions/transfer';
import { parseRequestPagination } from '../helpers/pagination';
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
    this.logger.level = process.env.LOG_LEVEL;
  }

  getPolicy(): Policy {
    return {
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
   * GET /transfers
   * @summary Returns all existing transfers
   * @operationId getAllTransfers
   * @tags transfers - Operations of transfer controller
   * @security JWT
   * @param {string} fromDate.query - Start date for selected transfers (inclusive)
   * @param {string} tillDate.query - End date for selected transfers (exclusive)
   * @param {integer} take.query - How many transfers the endpoint should return
   * @param {integer} skip.query - How many transfers should be skipped (for pagination)
   * @return {Array.<TransferResponse>} 200 - All existing transfers
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
      const transfers = await new TransferService().getTransfers(filters, { take, skip });
      res.json(transfers);
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
      const transfer = (
        (await new TransferService().getTransfers({ id: parsedId }, {})).records[0]);
      if (transfer) {
        res.json(transfer);
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

      res.json(await transferService.postTransfer(request));
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
