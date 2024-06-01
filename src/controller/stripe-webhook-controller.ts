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
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import StripeService from '../service/stripe-service';
import { RequestWithRawBody } from '../helpers/raw-body';

export default class StripeWebhookController extends BaseController {
  private logger: Logger = log4js.getLogger('StripeController');

  private stripeService: StripeService;

  /**
   * Create a new stripe webhook controller instance
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
      '/webhook': {
        POST: {
          policy: async () => true,
          handler: this.handleWebhookEvent.bind(this),
        },
      },
    };
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

    let webhookEvent;
    try {
      webhookEvent = await this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (error) {
      res.status(400).json('Event could not be verified');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.stripeService.handleWebhookEvent(webhookEvent);

    res.status(200).send();
  }
}
