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
import TransactionService, { TransactionFilterParameters } from '../service/transaction-service';
import { TransactionResponse } from './response/transaction-response';
import { isDate, isNumber } from '../helpers/validators';
import { validatePaginationQueryParams } from '../helpers/pagination';

function parseGetTransactionsFilters(req: RequestWithToken): TransactionFilterParameters {
  if ((req.query.pointOfSaleRevision && !req.query.pointOfSaleId)
    || (req.query.containerRevision && !req.query.containerId)
    || (req.query.productRevision && !req.query.productId)) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  const asInt = (input: any): number => {
    if (!isNumber(input, true)) throw new TypeError(`Input '${input}' is not a number.`);
    const parsed = (input ? parseInt(input, 10) : undefined);
    return parsed;
  };
  const filters: TransactionFilterParameters = {
    fromId: asInt(req.query.fromId),
    createdById: asInt(req.query.createdById),
    toId: asInt(req.query.toId),
    pointOfSaleId: asInt(req.query.pointOfSaleId),
    pointOfSaleRevision: asInt(req.query.pointOfSaleRevision),
    containerId: asInt(req.query.containerId),
    containerRevision: asInt(req.query.containerRevision),
    productId: asInt(req.query.productId),
    productRevision: asInt(req.query.productRevision),
    fromDate: req.query.fromDate,
    tillDate: req.query.tillDate,
  };

  if (filters.fromDate && typeof filters.fromDate !== 'object') {
    filters.fromDate = new Date(filters.fromDate);
  }
  if (filters.tillDate && typeof filters.tillDate !== 'object') {
    filters.tillDate = new Date(filters.tillDate);
  }

  if (!isDate(filters.fromDate, true)) throw new TypeError('filters.fromDate is not a date');
  if (!isDate(filters.tillDate, true)) throw new TypeError('filters.tillDate is not a date');

  return filters;
}

export default class TransactionController extends BaseController {
  private logger: Logger = log4js.getLogger('TransactionController');

  /**
   * Creates a new transaction controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transaction', ['*']),
          handler: this.getAllTransactions.bind(this),
        },
      },
      '/:id': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transaction', ['*']),
          handler: this.getTransaction.bind(this),
        },
      },
    };
  }

  /**
   * Get a list of all transactions
   * @route GET /transactions
   * @group transactions - Operations of the transaction controller
   * @security JWT
   * @param {integer} fromId.query - From-user for selected transactions
   * @param {integer} createdById.query - User that created selected transaction
   * @param {integer} toId.query - To-user for selected transactions
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
    this.logger.trace('Get all transactions by user', req.token.user);

    // Parse the filters given in the query parameters. If there are any issues,
    // the parse method will throw an exception. We will then return a 400 error.
    let filters;
    try {
      filters = parseGetTransactionsFilters(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    if (!validatePaginationQueryParams(req)) {
      res.status(400).json('The pagination skip and/or take are invalid');
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

  /**
   * Get a single transaction
   * @route GET /transactions/:id
   * @group transactions - Operations of the transaction controller
   * @security JWT
   * @returns {TransactionResponse.model} 200 - Single transaction with given id
   * @returns {string 404} - Nonexistent transaction id
   */
  public async getTransaction(req: RequestWithToken, res: Response): Promise<TransactionResponse> {
    const parameters = req.params;
    this.logger.trace('Get single transaction', parameters, 'by user', req.token.user);

    let transaction;
    try {
      transaction = await TransactionService.getSingleTransaction(parseInt(parameters.id, 10));
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
    }

    // If the transaction is undefined, there does not exist a transaction with the given ID
    if (transaction === undefined) {
      res.status(404).json('Unknown transaction ID.');
      return;
    }

    res.status(200).json(transaction);
  }
}
