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
 * This is the module page of the payment-request-public-controller.
 *
 * Unauthenticated share-link surface for {@link stripe/payment-request!PaymentRequest | PaymentRequest}.
 * Mirrors the pattern of {@link ./stripe-webhook-controller | StripeWebhookController}:
 * mounted *before* `setupAuthentication` in `src/index.ts`, with an
 * `async () => true` policy on every endpoint. Do **not** reuse endpoint
 * paths from the authenticated controller — the mount order is significant.
 *
 * The response shape here is {@link ./response/payment-request-response!PublicPaymentRequestResponse}
 * — it deliberately omits `createdBy`, `cancelledBy`, and other internal
 * audit fields, because anyone holding the link can hit these endpoints.
 *
 * @module stripe/payment-request
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import PaymentRequestService, {
  IllegalPaymentRequestTransitionError,
  InvalidPaymentRequestBeneficiaryError,
} from '../service/payment-request-service';
import PaymentRequest from '../entity/payment-request/payment-request';
import User from '../entity/user/user';
import {
  PaymentRequestStartResponse,
  PublicPaymentRequestResponse,
} from './response/payment-request-response';

export default class PaymentRequestPublicController extends BaseController {
  private logger: Logger = log4js.getLogger('PaymentRequestPublicController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  /**
   * @inheritDoc
   *
   * All endpoints here bypass authentication (policy is `async () => true`).
   * The controller is mounted before `setupAuthentication` in `src/index.ts`.
   */
  public getPolicy(): Policy {
    return {
      '/:id': {
        GET: {
          policy: async () => true,
          handler: this.returnSinglePaymentRequest.bind(this),
        },
      },
      '/:id/start': {
        POST: {
          policy: async () => true,
          handler: this.startPaymentPublic.bind(this),
        },
      },
    };
  }

  public static asPublicPaymentRequestResponse(request: PaymentRequest): PublicPaymentRequestResponse {
    return {
      id: request.id,
      forDisplayName: User.fullName(request.for),
      amount: request.amount.toObject(),
      expiresAt: request.expiresAt.toISOString(),
      description: request.description,
      status: request.status,
    };
  }

  /**
   * GET /payment-requests-public/{id}
   * @summary Fetch a PaymentRequest via the public share link. Returns a
   *   trimmed response that omits internal audit fields.
   * @operationId getPublicPaymentRequest
   * @tags paymentRequestsPublic - Unauthenticated share-link surface
   * @param {string} id.path.required - UUID v4 of the payment request.
   * @return {PublicPaymentRequestResponse} 200 - Single payment request (trimmed shape)
   * @return {string} 404 - Unknown id
   */
  public async returnSinglePaymentRequest(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Public get payment request', req.params.id);

    try {
      const service = new PaymentRequestService();
      const request = await service.getPaymentRequest(req.params.id);
      if (!request) {
        res.status(404).send();
        return;
      }
      res.status(200).json(PaymentRequestPublicController.asPublicPaymentRequestResponse(request));
    } catch (e) {
      this.logger.error('Could not get payment request (public):', e);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * POST /payment-requests-public/{id}/start
   * @summary Start a Stripe payment session for the given PaymentRequest
   *   without authentication — the share link IS the credential.
   * @operationId startPaymentRequestPublic
   * @tags paymentRequestsPublic - Unauthenticated share-link surface
   * @param {string} id.path.required - UUID v4 of the payment request.
   * @return {PaymentRequestStartResponse} 200 - Stripe client secret
   * @return {string} 404 - Unknown id
   * @return {string} 409 - Request is not in PENDING state
   */
  public async startPaymentPublic(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Public start payment', req.params.id);

    try {
      const service = new PaymentRequestService();
      const request = await service.getPaymentRequest(req.params.id);
      if (!request) {
        res.status(404).send();
        return;
      }
      const { deposit, clientSecret } = await service.startPayment(request);
      const response: PaymentRequestStartResponse = {
        paymentRequestId: request.id,
        stripeId: deposit.stripePaymentIntent.stripeId,
        clientSecret,
      };
      res.status(200).json(response);
    } catch (e) {
      if (e instanceof IllegalPaymentRequestTransitionError) {
        res.status(409).send(e.message);
        return;
      }
      if (e instanceof InvalidPaymentRequestBeneficiaryError) {
        res.status(400).send(e.message);
        return;
      }
      this.logger.error('Could not start public payment:', e);
      res.status(500).send('Internal server error.');
    }
  }
}
