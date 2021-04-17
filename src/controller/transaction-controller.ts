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
import { SwaggerSpecification } from 'swagger-model-validator';
import BaseController from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import TransactionService, { TransactionFilters } from '../services/TransactionService';

function parseGetTransactionsFilters(req: RequestWithToken): TransactionFilters {
  if ((req.query.pointOfSaleRevision && !req.query.pointOfSaleId)
    || (req.query.containerRevision && !req.query.containerId)
    || (req.query.productRevision && !req.query.productId)) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  return {
    fromId: req.query.fromId,
    createdById: req.query.createdById,
    toId: req.query.toId,
    pointOfSale: req.query.pointOfSaleId ? {
      id: req.query.pointOfSaleId,
      revision: req.query.pointOfSaleRevision,
    } : undefined,
    container: req.query.containerId ? {
      id: req.query.containerId,
      revision: req.query.containerRevision,
    } : undefined,
    product: req.query.productId ? {
      id: req.query.productId,
      revision: req.query.productRevision,
    } : undefined,
    fromDate: req.query.fromDate,
    tillDate: req.query.tillDate,
  };
}

export default class TransactionController extends BaseController {
  private logger: Logger = log4js.getLogger('TransactionController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: TransactionController.isTrue,
          handler: this.getAllTransactions.bind(this),
        },
      },
    };
  }

  public static async isTrue() {
    return true;
  }

  /**
   * Get a list of all transactions
   * @route GET /transactions
   * @group transactions - Operations of the transaction controller
   * @security JWT
   * @param {integer} fromId.query - From-user for selected transactions
   * @param {integer} createdById.query - User that created selected transaction
   * @param {integer} toId.query - To-user for selected transactions
   * @param {integer} pointOfSaleId.query - Point of Sale ID for selected transactions
   * @param {integer} pointOfSaleRevision.query - Point of Sale Revision for selected
   * transactions. Requires PointOfSaleId
   * @param {integer} containerId.query - Container ID for selected transactions
   * @param {integer} containerRevision.query - Container Revision for selected
   * transactions. Requires ContainerId
   * @param {integer} productId.query - Product ID for selected transactions
   * @param {integer} productRevision.query - Product Revision for selected
   * transactions. Requires ProductID
   * @param {string} fromDate.query - Start date for selected transactions (inclusive)
   * @param {string} tillDate.query - End date for selected transactions (exclusive)
   * @param {integer} take.query - How many users the endpoint should return
   * @param {integer} skip.query - How many users should be skipped (for pagination)
   * @returns {[TransactionResponse]} 200 - A list of all transactions
   */
  // eslint-disable-next-line class-methods-use-this
  public async getAllTransactions(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all transactions', 'by user', req.token.user);

    // Parse the filters given in the query parameters. If there are any issues,
    // the parse method will throw an exception. We will then return a 400 error.
    let filters;
    try {
      filters = parseGetTransactionsFilters(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const transactions = await TransactionService.getTransactions(req, filters);
      res.status(200).json(transactions);
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
    }
  }
}
