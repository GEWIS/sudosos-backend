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

export default class StripeWebhookController extends BaseController {
  private logger: Logger = log4js.getLogger('StripeController');

  /**
   * Create a new stripe webhook controller instance
   * @param options
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

    const response: StripePublicKeyResponse = {
      publicKey: process.env.STRIPE_PUBLIC_KEY,
      returnUrl: process.env.STRIPE_RETURN_URL,
    };

    res.json(response);
  }

  /**
   * Webhook for Stripe event updates
   *
   * @route POST /stripe/webhook
   * @operationId webhook
   * @tags stripe - Operations of the stripe controller
   * @return 200 - Success
   * @return 400 - Not
   */
  public async handleWebhookEvent(req: RequestWithRawBody, res: Response): Promise<void> {
    const { rawBody } = req;
    const signature = req.headers['stripe-signature'];

    let webhookEvent: Stripe.Event;
    try {
      webhookEvent = await new StripeService().constructWebhookEvent(rawBody, signature);
    } catch (error) {
      res.status(400).json('Event could not be verified');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    AppDataSource.manager.transaction(async (manager) => {
      const stripeService = new StripeService(manager);
      await stripeService.handleWebhookEvent(webhookEvent);
    }).catch((error) => {
      this.logger.error(error);
    });

    res.status(200).send();
  }
}
