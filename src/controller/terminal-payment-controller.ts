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
 * This is the module page of the terminal payment controller
 *
 * @module stripe/terminal-payment
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { CreateTerminalPaymentRequest, ProcessTerminalPaymentRequest } from './request/terminal-payment-request';
import { AppDataSource } from '../database/database';
import TerminalPaymentService from '../service/terminal-payment-service';
import { TerminalPaymentResponse } from './response/terminal-payment-response';
import StripeService from '../service/stripe-service';
import { asNumber } from '../helpers/validators';
import { TerminalPaymentState } from '../entity/transactions/terminal/terminal-payment';
import { UserType } from '../entity/user/user';
import WebSocketService from '../service/websocket-service';

export default class TerminalPaymentController extends BaseController {
  private logger: Logger = log4js.getLogger('TerminalPaymentController');

  /**
   * Create a new stripe controller instance
   * @param options
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'own', 'TerminalPayment', ['*'],
          ),
          handler: this.createTerminalPayment.bind(this),
          body: { modelName: 'CreateTerminalPaymentRequest' },
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', await TerminalPaymentController.getRelation(req), 'TerminalPayment', ['*'],
          ),
          handler: this.getSingleTerminalPayment.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'cancel', await TerminalPaymentController.getRelation(req), 'TerminalPayment', ['*'],
          ),
          handler: this.cancelTerminalPayment.bind(this),
        },
      },
      '/:id(\\d+)/process': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', await TerminalPaymentController.getRelation(req), 'TerminalPayment', ['*'],
          ),
          handler: this.startTerminalPayment.bind(this),
          body: { modelName: 'ProcessTerminalPaymentRequest' },
        },
      },
      '/terminals': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', 'own', 'TerminalPayment', ['*'],
          ),
          handler: this.getStripeTerminals.bind(this),
        },
      },
    };
  }

  /**
   * POST /terminal-payments
   *
   * @summary Create a terminal payment before executing.
   * @operationId createTerminalPayment
   * @tags terminalPayments - Operations of the Terminal Payment Controller
   * @security JWT
   * @param {CreateTerminalPaymentRequest} request.body.required - The terminal
   * payment that should be created.
   * @return {TerminalPaymentResponse} 200 - Terminal Payment
   * @return {string} 400 - Validation failure
   * @return {string} 500 - Internal server error
   */
  public async createTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Create new terminal payment by user', req.token.user);
    const request = req.body as CreateTerminalPaymentRequest;

    try {
      const { valid, context } = await new TerminalPaymentService().verifyTerminalPaymentRequest(request);

      if (!valid) {
        res.status(400).send('Could not validate terminalPayment.');
        return;
      }

      const allowedUserTypes = [UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.POINT_OF_SALE];
      const fromUser = context.users.get(request.transaction.from);
      if (!allowedUserTypes.includes(fromUser?.type)) {
        res.status(400).send(`Could not create terminalPayment for user "${fromUser.toString()}", because their account type is "${fromUser.type}"`);
        return;
      }

      let result: TerminalPaymentResponse;

      await AppDataSource.transaction(async (manager) => {
        const service = new TerminalPaymentService(manager);
        const terminalPayment = await service.createTerminalPayment(request, context);
        result = await TerminalPaymentService.asTerminalPaymentResponse(terminalPayment, context);
      });

      res.status(200).json(result);
    } catch (error) {
      this.logger.error('Could not create Terminal Payment:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * GET /terminal-payments/{id}
   * @summary Get single terminal payment by ID
   * @operationId getSingleTerminalPayment
   * @tags terminalPayments - Operations of the Terminal Payment Controller
   * @security JWT
   * @param {integer} id.path.required - The ID of the terminal payment
   * @return {TerminalPaymentResponse} 200 - Terminal Payment
   * @return {string} 404 - Not found
   * @return {string} 500 - Internal server error
   */
  public async getSingleTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get terminal payment with id', req.params.id, 'by user', req.token.user);
    const rawId = req.params.id;

    try {
      const id = Number.parseInt(rawId, 10);

      const service = new TerminalPaymentService();
      const terminalPayment = await service.getTerminalPayment(id);

      if (terminalPayment == null) {
        res.status(404).send(`Terminal Payment with ID "${id}" not found.`);
        return;
      }

      const result = await TerminalPaymentService.asTerminalPaymentResponse(terminalPayment);
      res.status(200).json(result);
    } catch (error) {
      this.logger.error('Could not get terminalPayment:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * POST /terminal-payments/{id}/process
   * @summary Start the payment process on the terminal for the TerminalPayment
   * with the given ID
   * @operationId startTerminalPayment
   * @tags terminalPayments - Operations of the Terminal Payment Controller
   * @security JWT
   * @param {integer} id.path.required - The ID of the terminal payment
   * @param {ProcessTerminalPaymentRequest} request.body.required - Payment options
   * @return 204 - Success
   * @return {string} 400 - Validation failure
   * @return {string} 404 - Terminal Payment or terminal not found
   * @return {string} 422 - Terminal unavailable
   * @return {string} 422 - TerminalPayment already paid
   * @return {string} 500 - Internal server error
   */
  public async startTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Start terminal payment by user', req.token.user);
    const rawId = req.params.id;
    const request = req.body as ProcessTerminalPaymentRequest;

    try {
      const id = Number.parseInt(rawId, 10);

      const service = new TerminalPaymentService();
      const terminalPayment = await service.getTerminalPayment(id);

      if (!terminalPayment) {
        res.status(404).send(`Terminal Payment with ID "${id}" not found.`);
        return;
      }

      if (terminalPayment.getState() === TerminalPaymentState.PAID) {
        res.status(422).send('TerminalPayment already paid.');
        return;
      }

      if (terminalPayment.getState() === TerminalPaymentState.CANCELLED) {
        res.status(422).send('TerminalPayment is cancelled.');
        return;
      }

      // Restarting a processing terminal payment is OK, as it can be used to
      // force-restart a terminal payment, for example when you reboot the
      // terminal reader and payment is not yet done. SudoSOS does not get
      // events like these.

      const terminal = await new StripeService().getSingleTerminal(request.stripeTerminalId);
      if (!terminal) {
        res.status(404).send(`Stripe terminal with ID "${request.stripeTerminalId}" not found.`);
        return;
      }

      if (!terminal.available) {
        res.status(422).send('Terminal unavailable (is it in use?)');
        return;
      }

      await AppDataSource.transaction(async (manager) => {
        await new TerminalPaymentService(manager).startTerminalPayment(id, request);
      });
      void this.emitStateChange(id);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not start terminalPayment:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
  * DELETE /terminal-payments/{id}
  * @summary Cancel a Terminal Payment that is created/processing
  * @operationId cancelTerminalPayment
  * @tags terminalPayments - Operations of the Terminal Payment Controller
  * @security JWT
  * @param {integer} id.path.required - The ID of the terminal payment
  * @return {TerminalPaymentResponse} 200 - Terminal Payment
  * @return {string} 404 - TerminalPayment not found
  * @return {string} 422 - TerminalPayment not created/processing
  * @return {string} 500 - Internal server error
   */
  public async cancelTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Start terminal payment by user', req.token.user);
    const rawId = req.params.id;

    try {
      const id = Number.parseInt(rawId, 10);

      const service = new TerminalPaymentService();
      let terminalPayment = await service.getTerminalPayment(id);

      if (!terminalPayment) {
        res.status(404).send(`Terminal Payment with ID "${id}" not found.`);
        return;
      }

      if (terminalPayment.getState() !== TerminalPaymentState.CREATED && terminalPayment.getState() !== TerminalPaymentState.PROCESSING) {
        res.status(422).send(`Terminal Payment cannot be cancelled, because it has state "${terminalPayment.getState()}"`);
        return;
      }

      await AppDataSource.transaction(async (manager) => {
        terminalPayment = await new TerminalPaymentService(manager).cancelTerminalPayment(id);
      });

      const response = await TerminalPaymentService.asTerminalPaymentResponse(terminalPayment);
      void this.emitStateChange(id);
      res.status(200).json(response);
    } catch (error) {
      this.logger.error('Could not cancel terminalPayment:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
  * GET /terminal-payments/terminals
  * @summary Get all Stripe terminals
  * @operationId getStripeTerminals
  * @tags terminalPayments - Operations of the Terminal Payment Controller
  * @security JWT
  * @return {Array.<StripePaymentTerminalResponse[]>} 200 - Stripe Terminals
  * @return {string} 500 - Internal server error
  */
  public async getStripeTerminals(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all Stripe terminals by user', req.token.user);

    try {
      const service = new StripeService();
      const terminals = await service.getTerminals();
      const response = terminals.map((t) => StripeService.asStripePaymentTerminalResponse(t));

      res.status(200).json(response);
    } catch (error) {
      this.logger.error('Could not get all Stripe terminals:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * Function to determine which credentials are needed to get terminalPayments:
   *   - all if user is not connected
   *   - own if user is connected
   * @param req - Request with terminalPayment ID as param
   * @return whether terminalPayment is connected to user token
   */
  private static async getRelation(req: RequestWithToken): Promise<'all' | 'own'> {
    const id = asNumber(req.params.id);
    const userId = req.token.user.id;

    // Shared with the websocket room policy, which authorizes subscriptions to
    // a single terminal payment's updates.
    return new TerminalPaymentService().getRelation(id, userId);
  }

  /**
   * Report a terminal payment's current state to websocket subscribers.
   *
   * Always called after the database transaction that changed the state has
   * committed, so a subscriber is never told about work that later rolls back.
   *
   * Call without awaiting. Failures are logged and swallowed here, so a
   * websocket problem affects neither the HTTP response nor the payment, and a
   * slow emit does not add latency to the response. This mirrors how
   * TransactionService emits `transaction:created`.
   * @param id ID of the TerminalPayment whose state changed.
   */
  private async emitStateChange(id: number): Promise<void> {
    try {
      const terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      if (!terminalPayment) return;
      const response = await TerminalPaymentService.asTerminalPaymentResponse(terminalPayment);
      await WebSocketService.emitTerminalPaymentUpdated(response);
    } catch (error) {
      this.logger.error('Could not emit terminal payment update for id', id, error);
    }
  }

}
