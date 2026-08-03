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
 * This is the module page of the stripe-webhook-controller.
 *
 * @module stripe
 */

import log4js, { Logger } from 'log4js';
import { Request, Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import StripeService from '../service/stripe-service';
import { RequestWithRawBody } from '../helpers/raw-body';
import { StripePublicKeyResponse } from './response/stripe-response';
import { AppDataSource } from '../database/database';
import Stripe from 'stripe';
import Config from '../config';
import StripeWebhookService from '../service/stripe-webhook-service';
import TerminalPaymentService from '../service/terminal-payment-service';
import WebSocketService from '../service/websocket-service';

export default class StripeWebhookController extends BaseController {
  private logger: Logger = log4js.getLogger('StripeWebhookController');

  /**
   * Create a new stripe webhook controller instance
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
      '/public': {
        GET: {
          policy: async () => true,
          handler: this.getStripePublicKey.bind(this),
        },
      },
      '/webhook': {
        POST: {
          policy: async () => true,
          handler: this.handleWebhookEvent.bind(this),
        },
      },
    };
  }

  /**
   * GET /stripe/public
   * @operationId getStripePublicKey
   * @summary Get the Stripe public key
   * @tags stripe - Operations of the stripe controller
   * @returns {string} 200 - Public key
   */
  public async getStripePublicKey(req: Request, res: Response): Promise<void> {
    this.logger.trace('Get Stripe public key by IP', req.ip);
    const config = Config.get();

    const response: StripePublicKeyResponse = {
      publicKey: config.stripe.publicKey,
      returnUrl: config.stripe.returnUrl,
    };

    res.json(response);
  }

  /**
   * POST /stripe/webhook
   *
   * @summary Webhook for Stripe event updates
   * @operationId webhook
   * @tags stripe - Operations of the stripe controller
   * @return 204 - Success
   * @return 400 - Event invalid error
   */
  public async handleWebhookEvent(req: RequestWithRawBody, res: Response): Promise<void> {
    this.logger.trace('Receive Stripe webhook event with body', req.body);
    const config = Config.get();
    const { rawBody } = req;
    const signature = req.headers['stripe-signature'];

    let webhookEvent: Stripe.Event;
    try {
      webhookEvent = await new StripeWebhookService().constructWebhookEvent(rawBody, signature);
    } catch (error) {
      res.status(400).json('Event could not be verified');
      return;
    }

    if (!webhookEvent.type.includes('payment_intent')) {
      this.logger.trace(`Event ignored, because it is type "${webhookEvent.type}"`);
      res.status(204).send();
      return;
    }

    if ((webhookEvent.data.object as any)?.metadata?.service !== config.app.name) {
      this.logger.trace(`Event ignored, because it is not for service "${config.app.name}"`);
      res.status(204).send();
      return;
    }

    const service = new StripeService();
    const { id } = (webhookEvent.data.object as Stripe.PaymentIntent);
    const paymentIntent = await service.getPaymentIntent(id);
    if (!paymentIntent) {
      this.logger.warn(`PaymentIntent with ID "${id}" not found.`);
      res.status(400).json(`PaymentIntent with ID "${id}" not found.`);
      return;
    }

    // NO await here, because we should execute the action asynchronously
    AppDataSource.manager.transaction(async (manager) => {
      const stripeService = new StripeWebhookService(manager);
      await stripeService.handleWebhookEvent(webhookEvent);
    }).then(async () => {
      // Deliberately after the transaction has committed. A terminal payment
      // reaching `paid` makes the point of sale clear its cart, so telling it
      // about a state that later rolls back would lose a sale.
      await this.emitTerminalPaymentUpdate(paymentIntent.id);
    }).catch((error) => {
      this.logger.error(error);
    });

    res.status(204).send();
  }

  /**
   * Report the new state of the terminal payment behind a payment intent, if
   * the intent belongs to one.
   *
   * Only call this once the webhook's database transaction has committed, so
   * subscribers never see state that is rolled back afterwards. Failures are
   * logged and swallowed: the payment has already been processed by this point
   * and a websocket problem must not turn that into an error.
   * @param paymentIntentId - Database ID of the Stripe payment intent.
   */
  private async emitTerminalPaymentUpdate(paymentIntentId: number): Promise<void> {
    try {
      const service = new TerminalPaymentService();
      const terminalPayment = await service.getTerminalPaymentByPaymentIntentId(paymentIntentId);
      if (!terminalPayment) return;

      const response = await TerminalPaymentService.asTerminalPaymentResponse(terminalPayment);
      await WebSocketService.emitTerminalPaymentUpdated(response);
    } catch (error) {
      this.logger.error('Could not emit terminal payment update for payment intent', paymentIntentId, error);
    }
  }
}
