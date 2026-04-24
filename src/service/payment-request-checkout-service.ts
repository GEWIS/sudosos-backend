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
 * This is the module page of the payment-request-checkout-service.
 *
 * Orchestrator for "start a Stripe payment session for an existing
 * PaymentRequest". Lives outside both {@link stripe!StripeService | StripeService}
 * and {@link stripe/payment-request-service!PaymentRequestService | PaymentRequestService}
 * so the two services do not import each other.
 *
 * The cross-edge that used to live inside `PaymentRequestService.startPayment`
 * (a `new StripeService(...)` call) is hoisted here. That keeps
 * `PaymentRequestService` as a pure CRUD + state-machine module and lets
 * `StripeService` import `PaymentRequestService` normally for the webhook
 * settlement hook in
 * {@link stripe!StripeService.createNewPaymentIntentStatus | createNewPaymentIntentStatus}.
 *
 * @module stripe/payment-request-checkout-service
 */

import { EntityManager } from 'typeorm';
import PaymentRequest from '../entity/payment-request/payment-request';
import StripeDeposit from '../entity/stripe/stripe-deposit';
import { PaymentRequestStatus } from '../entity/payment-request/payment-request-status';
import PaymentRequestService, { IllegalPaymentRequestTransitionError } from './payment-request-service';
import StripeService from './stripe-service';
import WithManager from '../database/with-manager';

/**
 * Bootstrap a Stripe payment session for a PaymentRequest.
 *
 * Validates the request is still PENDING and the beneficiary is payable, then
 * creates a {@link stripe!StripePaymentIntent | StripePaymentIntent} tied back
 * to the request. Used by both the authenticated "I want to pay my own
 * request" endpoint and the public share-link endpoint.
 */
export default class PaymentRequestCheckoutService extends WithManager {
  public constructor(manager?: EntityManager) {
    super(manager);
  }

  /**
   * Start a Stripe payment session for the given PaymentRequest.
   *
   * @throws {IllegalPaymentRequestTransitionError} if the request is not PENDING.
   * @throws {InvalidPaymentRequestBeneficiaryError} if the beneficiary is no
   *   longer payable (soft-deleted, type became invalid, etc.).
   *
   * @returns the created {@link stripe!StripeDeposit | StripeDeposit} and the
   *   Stripe `client_secret` the caller forwards to the browser.
   */
  public async startPayment(
    request: PaymentRequest,
  ): Promise<{ deposit: StripeDeposit; clientSecret: string }> {
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new IllegalPaymentRequestTransitionError(
        `cannot start payment on request in state ${request.status}`,
      );
    }
    PaymentRequestService.validatePayable(request.for);

    return new StripeService(this.manager).createStripePaymentIntent(
      request.for,
      request.amount,
      request,
    );
  }
}
