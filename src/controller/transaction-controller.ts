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
import { asDate, asNumber } from '../helpers/validators';
import { validatePaginationQueryParams } from '../helpers/pagination';
import { TransactionRequest } from './request/transaction-request';
import Transaction from '../entity/transactions/transaction';
import User from '../entity/user/user';

function parseGetTransactionsFilters(req: RequestWithToken): TransactionFilterParameters {
  if ((req.query.pointOfSaleRevision && !req.query.pointOfSaleId)
    || (req.query.containerRevision && !req.query.containerId)
    || (req.query.productRevision && !req.query.productId)) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  const filters: TransactionFilterParameters = {
    fromId: asNumber(req.query.fromId),
    createdById: asNumber(req.query.createdById),
    toId: asNumber(req.query.toId),
    pointOfSaleId: asNumber(req.query.pointOfSaleId),
    pointOfSaleRevision: asNumber(req.query.pointOfSaleRevision),
    containerId: asNumber(req.query.containerId),
    containerRevision: asNumber(req.query.containerRevision),
    productId: asNumber(req.query.productId),
    productRevision: asNumber(req.query.productRevision),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
  };

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

  // TODO: implement user policy
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
        POST: {
          body: { modelName: 'TransactionRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Transaction', ['*']),
          handler: this.createTransaction.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transaction', ['*']),
          handler: this.getTransaction.bind(this),
        },
        PATCH: {
          body: { modelName: 'TransactionRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Transaction', ['*']),
          handler: this.updateTransaction.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Transaction', ['*']),
          handler: this.deleteTransaction.bind(this),
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
   * Creates a new transaction
   * @route POST /transactions
   * @group transactions - Operations of the transaction controller
   * @param {TransactionRequest.model} transaction.body.required -
   * The transaction which should be created
   * @security JWT
   * @returns {TransactionResponse.model} 200 - The created transaction entity
   * @returns {string} 400 - Validation error
   * @returns {string} 403 - Insufficient balance error
   * @returns {string} 500 - Internal server error
   */
  // eslint-disable-next-line class-methods-use-this
  public async createTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as TransactionRequest;
    this.logger.trace('Create transaction', body, 'by user', req.token.user);

    // handle request
    try {
      if (await TransactionService.verifyTransaction(body)) {
        // verify balance is from user is borrelkaart
        const userType = (await User.findOne(body.from)).type;
        if (userType === 3 && !await TransactionService.verifyBalance(body)) {
          res.status(403).json('Mag niet.');
        }

        // create the transaction
        res.json(await TransactionService.createTransaction(body));
      } else {
        res.status(400).json('Invalid transaction.');
      }
    } catch (error) {
      this.logger.error('Could not create transaction:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get a single transaction
   * @route GET /transactions/{id}
   * @group transactions - Operations of the transaction controller
   * @param {integer} id.path.required - The id of the transaction which should be returned
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
      return;
    }

    // If the transaction is undefined, there does not exist a transaction with the given ID
    if (transaction === undefined) {
      res.status(404).json('Unknown transaction ID.');
      return;
    }

    res.status(200).json(transaction);
  }

  /**
   * Updates the requested transaction
   * @route PATCH /transactions/{id}
   * @group transactions - Operations of transaction controller
   * @param {integer} id.path.required - The id of the transaction which should be updated
   * @param {BorrelkaartGroupRequest.model} transaction.body.required -
   * The updated transaction
   * @security JWT
   * @returns {TransactionResponse.model} 200 - The requested transaction entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as TransactionRequest;
    const { id } = req.params;
    this.logger.trace('Update Transaction', id, 'by user', req.token.user);

    // handle request
    try {
      if (await Transaction.findOne(id)) {
        if (await TransactionService.verifyTransaction(body)) {
          res.status(200).json(await TransactionService.updateTransaction(
            parseInt(id, 10), body,
          ));
        } else {
          res.status(400).json('Invalid transaction.');
        }
      } else {
        res.status(404).json('Transaction not found.');
      }
    } catch (error) {
      this.logger.error('Could not update transaction:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Deletes a transaction
   * @route DELETE /transactions/{id}
   * @group transactions - Operations of the transaction controller
   * @param {integer} id.path.required - The id of the transaction which should be deleted
   * @security JWT
   * @returns {TransactionResponse.model} 200 - The deleted transaction
   * @returns {string} 404 - Nonexistent transaction id
   */
  // eslint-disable-next-line class-methods-use-this
  public async deleteTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete transaction', id, 'by user', req.token.user);

    // handle request
    try {
      if (await Transaction.findOne(id)) {
        res.status(200).json(await TransactionService.deleteTransaction(parseInt(id, 10)));
      } else {
        res.status(404).json('Transaction not found.');
      }
    } catch (error) {
      this.logger.error('Could not delete transaction:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
