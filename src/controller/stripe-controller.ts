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
import log4js, { Logger } from 'log4js';
import { Request, Response } from 'express';
import dinero from 'dinero.js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import StripeService from '../service/stripe-service';
import { StripeRequest } from './request/stripe-request';

export default class StripeController extends BaseController {
  private logger: Logger = log4js.getLogger('StripeController');

  private stripeService: StripeService;

  /**
   * Create a new deposit controller instance
   * @param options
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.stripeService = new StripeService();
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/deposit': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'StripeDeposit', ['*'],
          ),
          handler: this.createStripeDeposit.bind(this),
          body: { modelName: 'StripeRequest' },
        },
      },
      '/webhook': {
        POST: {
          policy: async () => true,
          handler: this.updateStripeDepositStatus.bind(this),
        },
      },
    };
  }

  /**
   * Start the stripe deposit flow
   * @route POST /stripe/deposit
   * @group deposits - Operations of the deposit controller
   * @param {StripeRequest.model} stripe.body.required - The deposit that should be created
   * @returns {StripePaymentIntentResponse.model} 200 - Payment Intent information
   * @returns {string} 500 - Internal server error
   * @security JWT
   */
  public async createStripeDeposit(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Create a new stripe deposit by user', req.token.user);
    const request = req.body as StripeRequest;

    try {
      const amount = dinero(request.amount as Dinero.Options);
      const result = this.stripeService.createStripePaymentIntent(req.token.user, amount);
      res.status(200).json(result);
    } catch (error) {
      this.logger.error('Could not create Stripe payment intent:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * Webhook for Stripe event updates
   *
   * @route POST /stripe/webhook
   * @group deposits - Operations of the deposit controller
   * @returns 200 - Success
   * @returns 400 - Not
   */
  public async updateStripeDepositStatus(req: Request, res: Response): Promise<void> {
    const { body } = req;
    const signature = req.headers['stripe-signature'];

    let webhookEvent;
    try {
      webhookEvent = await this.stripeService.constructWebhookEvent(body, signature);
    } catch (error) {
      res.status(400).json('Event could not be verified');
      return;
    }

    StripeService.handleWebhookEvent(webhookEvent);

    res.status(200);
  }
}
