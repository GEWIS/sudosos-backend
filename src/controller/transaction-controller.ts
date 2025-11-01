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
 *
 *  @license
 */

/**
 * This is the module page of the transaction-controller.
 *
 * @module transactions
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import TransactionService, {
  parseGetTransactionsFilters,
} from '../service/transaction-service';
import { TransactionResponse } from './response/transaction-response';
import { parseRequestPagination } from '../helpers/pagination';
import { TransactionRequest } from './request/transaction-request';
import Transaction from '../entity/transactions/transaction';
import User from '../entity/user/user';
import { asNumber } from '../helpers/validators';
import userTokenInOrgan from '../helpers/token-helper';
import UserService from '../service/user-service';
import InvoiceService from '../service/invoice-service';
import TokenHandler from '../authentication/token-handler';
import POSTokenVerifier, { PosAuthenticationError } from '../helpers/pos-token-verifier';

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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await TransactionController.filterRelation(req), 'Transaction', ['*']),
          handler: this.getAllTransactions.bind(this),
        },
        POST: {
          body: { modelName: 'TransactionRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', await TransactionController.postRelation(req), 'Transaction', ['*']),
          handler: this.createTransaction.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await TransactionController.getRelation(req), 'Transaction', ['*']),
          handler: this.getTransaction.bind(this),
        },
        PATCH: {
          body: { modelName: 'TransactionRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', await TransactionController.postRelation(req), 'Transaction', ['*']),
          handler: this.updateTransaction.bind(this),
          restrictions: {
            lesser: false,
          },
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', await TransactionController.getRelation(req), 'Transaction', ['*']),
          handler: this.deleteTransaction.bind(this),
        },
      },
      '/:id(\\d+)/invoices': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Invoice', ['*']),
          handler: this.getTransactionInvoices.bind(this),
        },
      },
      '/:validate': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', await TransactionController.postRelation(req), 'Transaction', ['*']),
          handler: this.validateTransaction.bind(this),
        },
      },
    };
  }

  /**
   * GET /transactions
   * @summary Get a list of all transactions
   * @operationId getAllTransactions
   * @tags transactions - Operations of the transaction controller
   * @security JWT
   * @param {integer} fromId.query - From-user for selected transactions
   * @param {integer} createdById.query - User that created selected transaction
   * @param {integer} toId.query - To-user for selected transactions
   * @param {integer} excludeById.query - Created by user to exclude from transactions
   * @param {integer} excludeFromId.query - From user to exclude from transactions
   * @param {integer} pointOfSaleId.query - Point of sale ID for selected transactions
   * @param {integer} productId.query - Product ID for selected transactions
   * @param {integer} productRevision.query - Product Revision for selected transactions. Requires ProductID
   * @param {string} fromDate.query - Start date for selected transactions (inclusive)
   * @param {string} tillDate.query - End date for selected transactions (exclusive)
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @return {PaginatedBaseTransactionResponse} 200 - A list of all transactions
   */
  public async getAllTransactions(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all transactions by user', req.token.user);

    // Parse the filters given in the query parameters. If there are any issues,
    // the parse method will throw an exception. We will then return a 400 error.
    let filters;
    let take;
    let skip;
    try {
      filters = parseGetTransactionsFilters(req);
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const transactions = await new TransactionService().getTransactions(filters, { take, skip });
      res.status(200).json(transactions);
    } catch (e) {
      res.status(500).send();
      this.logger.error(e);
    }
  }

  /**
   * POST /transactions
   * @summary Creates a new transaction
   * @operationId createTransaction
   * @tags transactions - Operations of the transaction controller
   * @param {TransactionRequest} request.body.required -
   * The transaction which should be created
   * @security JWT
   * @return {TransactionResponse} 200 - The created transaction entity
   * @return {string} 400 - Validation error
   * @return {string} 403 - Insufficient balance error or invalid POS token
   * @return {string} 500 - Internal server error
   */
  public async createTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as TransactionRequest;
    this.logger.trace('Create transaction', body, 'by user', req.token.user);

    // handle request
    try {
      // Verify POS token for lesser tokens
      if (req.token.lesser) {
        await POSTokenVerifier.verify(req, body.pointOfSale.id);
      }

      if (!await new TransactionService().verifyTransaction(body)) {
        res.status(400).json('Invalid transaction.');
        return;
      }

      // verify balance if user cannot have negative balance.
      const user = await User.findOne({ where: { id: body.from } });
      if (!user.canGoIntoDebt && !await new TransactionService().verifyBalance(body)) {
        res.status(403).json('Insufficient balance.');
      } else {
        // create the transaction
        res.json(await new TransactionService().createTransaction(body));
      }
    } catch (error) {
      if (error instanceof PosAuthenticationError) {
        res.status(403).end('Invalid POS token.');
        return;
      }
      this.logger.error('Could not create transaction:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /transactions/{id}
   * @summary Get a single transaction
   * @operationId getSingleTransaction
   * @tags transactions - Operations of the transaction controller
   * @param {integer} id.path.required - The id of the transaction which should be returned
   * @security JWT
   * @return {TransactionResponse} 200 - Single transaction with given id
   * @return {string} 404 - Nonexistent transaction id
   */
  public async getTransaction(req: RequestWithToken, res: Response): Promise<TransactionResponse> {
    const parameters = req.params;
    this.logger.trace('Get single transaction', parameters, 'by user', req.token.user);

    let transaction;
    try {
      transaction = await new TransactionService().getSingleTransaction(parseInt(parameters.id, 10));
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
   * PATCH /transactions/{id}
   * @summary Updates the requested transaction
   * @operationId updateTransaction
   * @tags transactions - Operations of transaction controller
   * @param {integer} id.path.required - The id of the transaction which should be updated
   * @param {TransactionRequest} request.body.required -
   * The updated transaction
   * @security JWT
   * @return {TransactionResponse} 200 - The requested transaction entity
   * @return {string} 400 - Validation error
   * @return {string} 403 - Lesser tokens cannot update transactions
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async updateTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as TransactionRequest;
    const { id } = req.params;
    this.logger.trace('Update Transaction', id, 'by user', req.token.user);

    // handle request
    try {
      if (await Transaction.findOne({ where: { id: parseInt(id, 10) } })) {
        if (await new TransactionService().verifyTransaction(body, true)) {
          res.status(200).json(await new TransactionService().updateTransaction(
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
   * DELETE /transactions/{id}
   * @summary Deletes a transaction
   * @operationId deleteTransaction
   * @tags transactions - Operations of the transaction controller
   * @param {integer} id.path.required - The id of the transaction which should be deleted
   * @security JWT
   * @return 204 - No content
   * @return {string} 404 - Nonexistent transaction id
   */
  // eslint-disable-next-line class-methods-use-this
  public async deleteTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete transaction', id, 'by user', req.token.user);

    // handle request
    try {
      if (await Transaction.findOne({ where: { id: parseInt(id, 10) } })) {
        await new TransactionService().deleteTransaction(parseInt(id, 10));
        res.status(204).json();
      } else {
        res.status(404).json('Transaction not found.');
      }
    } catch (error) {
      this.logger.error('Could not delete transaction:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /transactions/{id}/invoices
   * @summary Get all invoices containing subtransaction rows from this transaction
   * @operationId getTransactionInvoices
   * @tags transactions - Operations of the transaction controller
   * @param {integer} id.path.required - The transaction ID
   * @security JWT
   * @return {Array<BaseInvoiceResponse>} 200 - List of invoices
   * @return {string} 404 - Transaction not found
   * @return {string} 500 - Internal server error
   */
  public async getTransactionInvoices(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const transactionId = parseInt(id, 10);
    this.logger.trace('Get transaction invoices', id, 'by user', req.token.user);

    try {
      const transaction = await Transaction.findOne({ where: { id: transactionId } });
      if (!transaction) {
        res.status(404).json('Transaction not found.');
        return;
      }

      const invoices = await new InvoiceService().getTransactionInvoices(transactionId);
      res.status(200).json(invoices);
    } catch (error) {
      this.logger.error('Could not return transaction invoices:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /transactions/validate
   * @summary Function to validate the transaction immediatly after it is created
   * @operationId validateTransaction
   * @tags transactions - Operations of the transaction controller
   * @param {TransactionRequest} request.body.required -
   * The transaction which should be validated
   * @return {boolean} 200 - Transaction validated
   * @security JWT
   * @return {string} 400 - Validation error
   * @return {string} 403 - Invalid POS token
   * @return {string} 500 - Internal server error
   */
  public async validateTransaction(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as TransactionRequest;
    this.logger.trace('Validate transaction', body, 'by user', req.token.user);

    try {
      // Verify POS token for lesser tokens
      if (req.token.lesser) {
        await POSTokenVerifier.verify(req, body.pointOfSale.id);
      }

      if (await new TransactionService().verifyTransaction(body)) {
        res.status(200).json(true);
      } else  {
        res.status(400).json('Transaction is invalid');
        return;
      }
    } catch (error) {
      // Check for PosAuthenticationError using instanceof
      if (error instanceof PosAuthenticationError) {
        res.status(403).end('Invalid POS token.');
        return;
      }
      this.logger.error('Could not validate transaction:', error);
      res.status(500).json('Internal server error');
    }
  }


  /**
   * Determines the relation between the user and the transaction (by filters in the request).
   * - Returns 'own' if user is from, to, or createdBy.
   * - Returns 'organ' if user shares an organ with any of those users.
   * - Returns 'all' otherwise.
   *
   * @param req - Express request with user token and filters in query params.
   * @returns 'own' | 'organ' | 'all'
   */
  static async filterRelation(
    req: RequestWithToken,
  ): Promise<'own' | 'organ' | 'all'> {
    try {
      const userId = req.token.user.id;
      const { fromId, toId, createdById } = parseGetTransactionsFilters(req);

      // Check direct involvement
      if (fromId === userId || toId === userId || createdById === userId) {
        return 'own';
      }

      // Check organ relation
      if (
        (fromId && await UserService.areInSameOrgan(userId, fromId)) ||
          (toId && await UserService.areInSameOrgan(userId, toId)) ||
          (createdById && await UserService.areInSameOrgan(userId, createdById))
      ) {
        return 'organ';
      }

      return 'all';
    } catch (error) {
      return 'all';
    }
  }
  
  /**
   * Function to determine which credentials are needed to post transaction
   *    all if user is not connected to transaction
   *    other if transaction createdby is and linked via organ
   *    own if user is connected to transaction
   * @param req - Request with TransactionRequest in the body
   * @return whether transaction is connected to user token
   */
  static async postRelation(req: RequestWithToken): Promise<string> {
    const request = req.body as TransactionRequest;
    if (request.createdBy !== req.token.user.id) {
      if (await UserService.areInSameOrgan(request.createdBy, req.token.user.id)) {
        return 'organ';
      }
      return 'all';
    }
    if (request.from === req.token.user.id) return 'own';
    return 'all';
  }

  /**
   * Function to determine which credentials are needed to get transactions
   *    all if user is not connected to transaction
   *    organ if user is not connected to transaction via organ
   *    own if user is connected to transaction
   * @param req - Request with transaction id as param
   * @return whether transaction is connected to user token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const transaction = await Transaction.findOne({
      where: { id: asNumber(req.params.id) },
      relations: ['from', 'createdBy', 'pointOfSale', 'pointOfSale.pointOfSale', 'pointOfSale.pointOfSale.owner'],
    });
    if (!transaction) return 'all';
    if (userTokenInOrgan(req, transaction.from.id)
        || userTokenInOrgan(req, transaction.createdBy.id)
        || userTokenInOrgan(req, transaction.pointOfSale.pointOfSale.owner.id)) return 'organ';
    if (transaction.from.id === req.token.user.id || transaction.createdBy.id === req.token.user.id) return 'own';
    return 'all';
  }
}
