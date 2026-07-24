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
 * This is the module page of the stripe-webhook-service.
 *
 * @module stripe
 */

import log4js, { Logger } from 'log4js';
import WithManager from '../database/with-manager';
import { EntityManager } from 'typeorm';
import Stripe from 'stripe';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import StripePaymentIntentStatus, { StripePaymentIntentState } from '../entity/stripe/stripe-payment-intent-status';
import Config from '../config';
import StripeService, { StripeFactory } from './stripe-service';
import PaymentRequestService from './payment-request-service';
import TerminalPaymentService from './terminal-payment-service';
import { TerminalPaymentState } from '../entity/transactions/terminal/terminal-payment';

export default class StripeWebhookService extends WithManager {
  private stripe: Stripe;

  private logger: Logger;

  constructor(manager?: EntityManager) {
    super(manager);
    this.stripe = StripeFactory.create();
    this.logger = log4js.getLogger('StripeWebhookService');
  }

  /**
   * Validate a Stripe webhook event
   * @param body
   * @param signature
   */
  public async constructWebhookEvent(
    body: any, signature: string | string[],
  ): Promise<Stripe.Event> {
    const webhookSecret = Config.get().stripe.webhookSecret;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
    }

    return this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
  }

  /**
   * Append a new status to a {@link StripePaymentIntent} and, when the new
   * state is terminal, run the side effects for whatever the intent is linked
   * to. On `SUCCEEDED` this settles the deposit (and marks any linked
   * PaymentRequest as paid) or finalises the terminal payment; on `CANCELLED`
   * it propagates a Stripe-initiated cancellation to a linked terminal payment.
   *
   * Rejects when the intent does not exist, when the status already exists, or
   * when it would conflict with a mutually exclusive terminal state already
   * present (SUCCEEDED/FAILED/CANCELLED).
   * @param paymentIntentId The local (database) ID of the payment intent.
   * @param state The new state to record.
   * @returns The persisted {@link StripePaymentIntentStatus}.
   */
  public async createNewPaymentIntentStatus(
    paymentIntentId: number, state: StripePaymentIntentState,
  ): Promise<StripePaymentIntentStatus> {
    const paymentIntent = await this.manager.getRepository(StripePaymentIntent)
      .findOne({ where: { id: paymentIntentId }, relations: { deposit: true, paymentRequest: true, terminalPayment: true } });
    if (!paymentIntent) {
      throw new Error(`PaymentIntent with id "${paymentIntentId}" not found.`);
    }

    const states = paymentIntent.paymentIntentStatuses?.map((status) => status.state) ?? [];
    const mutuallyExclusiveStates = [
      StripePaymentIntentState.SUCCEEDED,
      StripePaymentIntentState.FAILED,
      StripePaymentIntentState.CANCELLED,
    ];
    if (states.includes(state)) throw new Error(`Status ${state} already exists.`);
    if (mutuallyExclusiveStates.includes(state)) {
      const forbiddenStates = [...mutuallyExclusiveStates];
      forbiddenStates.splice(forbiddenStates.indexOf(state), 1);
      for (const s of forbiddenStates) {
        if (states.includes(s)) throw new Error(`Cannot create status ${StripePaymentIntentState[state]}, because ${StripePaymentIntentState[s]} already exists`);
      }
    }

    const paymentIntentStatus = await this.manager.getRepository(StripePaymentIntentStatus)
      .save({ stripePaymentIntent: paymentIntent, state });

    // If payment has succeeded, create the transfer
    if (state === StripePaymentIntentState.SUCCEEDED && !!paymentIntent.deposit) {
      await new StripeService(this.manager).handleStripeDepositPaid(paymentIntent);

      // If the intent was initiated by a PaymentRequest, flip the request to
      // PAID. This runs *after* the credit Transfer is saved so that a
      // successful settlement is the single observable event.
      //
      // Best-effort: Stripe settlement has already succeeded and the credit
      // Transfer is persisted. A PaymentRequest state-machine conflict
      // (e.g. admin cancelled the request after the intent was created)
      // must not roll back the deposit — log and continue. The user is
      // credited either way; reconciling the PaymentRequest state is a
      // secondary concern.
      if (paymentIntent.paymentRequest) {
        try {
          await new PaymentRequestService(this.manager).markPaidFromStripeIntent(paymentIntent);
        } catch (error) {
          this.logger.error(
            'Failed to mark PaymentRequest as PAID for succeeded Stripe payment intent; '
            + 'the credit Transfer was still created and the user has been credited.',
            {
              paymentIntentId: paymentIntent.id,
              stripeId: paymentIntent.stripeId,
              paymentRequestId: paymentIntent.paymentRequest.id,
              error,
            },
          );
        }
      }
    }
    if (state === StripePaymentIntentState.SUCCEEDED && !!paymentIntent.terminalPayment) {
      await new TerminalPaymentService(this.manager).handleTerminalPaymentSuccess(paymentIntent);
    }

    // If payment is cancelled, propagate this to appropriate entity if cancellation is done by Stripe (and not SudoSOS)
    if (state === StripePaymentIntentState.CANCELLED && !!paymentIntent.terminalPayment && paymentIntent.terminalPayment.getState() !== TerminalPaymentState.CANCELLED) {
      await new TerminalPaymentService(this.manager).cancelTerminalPayment(paymentIntent.terminalPayment.id, false);
    }

    return paymentIntentStatus;
  }

  /**
   * Handle the event by making the appropriate database additions
   * @param event {Stripe.Event} Event received from Stripe webhook
   */
  public async handleWebhookEvent(event: Stripe.Event) {
    try {
      const eventPaymentIntent = event.data.object as Stripe.PaymentIntent;
      const paymentIntent = await StripePaymentIntent.findOne({
        where: { stripeId: eventPaymentIntent.id },
        relations: { deposit: { transfer: true }, paymentIntentStatuses: true },
      });

      if (!paymentIntent) {
        throw new Error(`Could not find payment intent with ID "${eventPaymentIntent.id}"`);
      }

      switch (event.type) {
        case 'payment_intent.created':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.CREATED);
          break;
        case 'payment_intent.processing':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.PROCESSING);
          break;
        case 'payment_intent.succeeded':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.SUCCEEDED);
          break;
        case 'payment_intent.payment_failed':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.FAILED);
          break;
        case 'payment_intent.canceled':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.CANCELLED);
          break;
        default:
          this.logger.warn('Tried to process event', event.type, 'but processing method is not defined');
      }

      this.logger.trace(`Successfully processed event "${event.type}" for payment intent "${eventPaymentIntent.id}" (ID: ${paymentIntent.id})`);
    } catch (error) {
      this.logger.error('Could not process Stripe webhook event with ID', event.id, error);
    }
  }
}
