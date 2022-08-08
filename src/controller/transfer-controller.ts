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
import Transfer from '../entity/transactions/transfer';
import { parseRequestPagination } from '../helpers/pagination';
import userTokenInOrgan from '../helpers/token-helper';

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
      },
    };
  }

  /**
   * Function to determine which credentials are needed to get transaction
   *        all if user is not connected to transaction
   *        own if user is connected to transaction
   *        organ if user is connected to transaction via organ
   * @param req
   * @returns whether transaction is connected to used token
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
   * Returns all existing transfers
   * @route GET /transfers
   * @group transfers - Operations of transfer controller
   * @security JWT
   * @param {integer} take.query - How many transfers the endpoint should return
   * @param {integer} skip.query - How many transfers should be skipped (for pagination)
   * @returns {Array<TransferResponse.model>} 200 - All existing transfers
   * @returns {string} 500 - Internal server error
   */
  public async returnAllTransfers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all transfers by user', body, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const transfers = await TransferService.getTransfers({}, { take, skip });
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
        (await TransferService.getTransfers({ id: parsedId }, {})).records[0]);
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
      if (!(await TransferService.verifyTransferRequest(request))) {
        res.status(400).json('Invalid transfer.');
        return;
      }

      res.json(await TransferService.postTransfer(request));
    } catch (error) {
      this.logger.error('Could not create transfer:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
