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
import { Response } from 'express';
import Dinero, { DineroObject } from 'dinero.js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import StripeService from '../service/stripe-service';
import { StripeRequest } from './request/stripe-request';

export default class StripeController extends BaseController {
  private logger: Logger = log4js.getLogger('StripeController');

  private stripeService: StripeService;

  /**
   * Create a new stripe controller instance
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
    };
  }

  /**
   * Start the stripe deposit flow
   * @route POST /stripe/deposit
   * @group Stripe - Operations of the stripe controller
   * @param {StripeRequest.model} stripe.body.required - The deposit that should be created
   * @returns {StripePaymentIntentResponse.model} 200 - Payment Intent information
   * @returns {string} 500 - Internal server error
   * @security JWT
   */
  public async createStripeDeposit(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Create a new stripe deposit by user', req.token.user);
    const request = req.body as StripeRequest;

    try {
      const amount = Dinero({ ...request.amount } as DineroObject);
      const result = await this.stripeService.createStripePaymentIntent(req.token.user, amount);
      res.status(200).json(result);
    } catch (error) {
      this.logger.error('Could not create Stripe payment intent:', error);
      res.status(500).send('Internal server error.');
    }
  }
}
