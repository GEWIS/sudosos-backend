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
import TransferService from '../service/transfer-service';
import TransferRequest from './request/transfer-request';
import ProductCategoryService from '../service/product-category-service';

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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transfer', ['*']),
          handler: this.returnTransfer.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing transfers
   * @route GET /transfers
   * @group transfers - Operations of transfer controller
   * @security JWT
   * @returns {Array<TransferResponse>} 200 - All existing transfers
   * @returns {string} 500 - Internal server error
   */
  public async returnAllTransfers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all transfers', body, 'by user', req.token.user);
    try {
      const transfers = await TransferService.getTransfers();
      res.json(transfers);
    } catch (error) {
      this.logger.error('Could not return all transfers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested transfer
   * @route GET /transfers/{id}
   * @group transfers - Operations of transfer controller
   * @param {integer} id.path.required - The id of the transfer which should be returned
   * @security JWT
   * @returns {TransferResponse.model} 200 - The requested transfer entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnTransfer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single transfer', id, 'by user', req.token.user);
    try {
      const parsedId = parseInt(id, 10);
      const transfer = (
        (await TransferService.getTransfers({ id: parsedId }))[0]);
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
   * Post a new transfer.
   * @route POST /transfers
   * @group transfers - Operations of transfer controller
   * @param {TransferRequest.model} transfer.body.required
   * - The transfer which should be created
   * @security JWT
   * @returns {TransferResponse.model} 200 - The created transfer entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async postTransfer(req: RequestWithToken, res: Response) : Promise<void> {
    const request = req.body as TransferRequest;
    this.logger.trace('Post transfer', request, 'by user', req.token.user);
    try {
      if (await TransferService.verifyTransferRequest(request)) {
        res.json(await TransferService.postTransfer(request));
      } else {
        res.status(400).json('Invalid transfer.');
      }
    } catch (error) {
      this.logger.error('Could not create transfer:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
