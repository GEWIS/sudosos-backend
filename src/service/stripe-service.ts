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
import Stripe from 'stripe';
import { Dinero } from 'dinero.js';
import { getLogger, Logger } from 'log4js';
import User from '../entity/user/user';
import StripeDeposit from '../entity/deposit/stripe-deposit';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import StripeDepositStatus, { StripeDepositState } from '../entity/deposit/stripe-deposit-status';
import {
  StripeDepositResponse,
  StripeDepositStatusResponse,
  StripePaymentIntentResponse,
} from '../controller/response/stripe-response';
import TransferService from './transfer-service';
import { IsNull } from 'typeorm';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import Database from '../database/database';
import PaymentIntentCancelParams = module;

export const STRIPE_API_VERSION = '2022-08-01';

export default class StripeService {
  private stripe: Stripe;

  private logger: Logger;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });
    this.logger = getLogger('StripeController');
  }

  private static asStripeDepositStatusResponse(status: StripeDepositStatus): StripeDepositStatusResponse {
    return {
      id: status.id,
      createdAt: status.createdAt.toISOString(),
      updatedAt: status.updatedAt.toISOString(),
      version: status.version,
      state: status.state,
    };
  }

  public static asStripeDepositResponse(deposit: StripeDeposit): StripeDepositResponse {
    return {
      id: deposit.id,
      createdAt: deposit.createdAt.toISOString(),
      updatedAt: deposit.updatedAt.toISOString(),
      version: deposit.version,
      stripeId: deposit.stripeId,
      depositStatus: deposit.depositStatus.map((s) => this.asStripeDepositStatusResponse(s)),
      amount: deposit.amount.toObject(),
      to: parseUserToBaseResponse(deposit.to, true),
    };
  }

  public static async getUnfinishedStripeDeposits(userId?: number): Promise<StripeDepositResponse[]> {
    const deposits = await StripeDeposit.find({
      where: {
        to: {
          id: userId,
        },
        transfer: IsNull(),
      },
      relations: ['to'],
    });

    return deposits.filter((d) => d.depositStatus.every(
      (s) => s.state === StripeDepositState.CREATED))
      .map((d) => this.asStripeDepositResponse(d));
  }

  public static async getStripeDeposit(id: number, relations: string[] = []) {
    return StripeDeposit.findOne({
      where: { id },
      relations: ['depositStatus'].concat(relations),
    });
  }

  /**
   * Create a payment intent and save it to the database
   * @param user User that wants to deposit some money into their account
   * @param amount The amount to be deposited
   */
  public async createStripePaymentIntent(
    user: User, amount: Dinero,
  ): Promise<StripePaymentIntentResponse> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: DineroTransformer.Instance.to(amount),
      currency: amount.getCurrency(),
      automatic_payment_methods: { enabled: true },
    });

    const stripeDeposit = Object.assign(new StripeDeposit(), {
      stripeId: paymentIntent.id,
      to: user,
      amount,
    });

    await stripeDeposit.save();

    return {
      id: stripeDeposit.id,
      createdAt: stripeDeposit.createdAt.toISOString(),
      updatedAt: stripeDeposit.updatedAt.toISOString(),
      stripeId: stripeDeposit.stripeId,
      clientSecret: paymentIntent.client_secret,
    };
  }

  /**
   * Cancel a stripe deposit, only if it has the current state "CREATED"
   * For example when a user starts a deposit but does not actually finish it
   * @param id
   * @param cancellation_reason
   */
  public async cancelStripeDeposit(id: number, cancellation_reason: PaymentIntentCancelParams) {
    const deposit = await StripeService.getStripeDeposit(id);
    if (deposit.depositStatus.length > 1) {
      throw new Error('Stripe deposit can no longer be canceled, because it is already processing, has succeeded or has failed');
    }

    await this.stripe.paymentIntents.cancel(deposit.stripeId, { cancellation_reason });

    // Stripe will send the CANCELED state once they have processed the cancellation via the webhook
    return;
  }

  /**
   * Cancel all payment intents in Stripe deposits that have no new state for at least 24 hours
   * @return Array of all deposits that have been canceled
   */
  public async cancelAbandonedPaymentIntents(): Promise<StripeDepositResponse[]> {
    const deposits = await StripeService.getUnfinishedStripeDeposits();
    const abandonedDeposits = deposits.filter((d) => {
      const lastChange = d.depositStatus.reduce((date, s) => {
        const msSinceEpoch = new Date(s.updatedAt).getTime();
        return new Date(Math.max(msSinceEpoch, date.getTime()));
      }, new Date(0));
      // If more than 24 hours no activity
      return (new Date().getTime() - lastChange.getTime()) > 1000 * 60 * 60 * 24;
    });

    await Promise.all(abandonedDeposits.map(async (d) => this.cancelStripeDeposit(d.id)));
    return abandonedDeposits;
  }

  /**
   * Validate a Stripe webhook event
   * @param body
   * @param signature
   */
  public async constructWebhookEvent(
    body: any, signature: string | string[],
  ): Promise<Stripe.Event> {
    return this.stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  }

  /**
   * Create a new deposit status
   * @param depositId
   * @param state
   */
  public static async createNewDepositStatus(
    depositId: number, state: StripeDepositState,
  ): Promise<StripeDepositStatus> {
    return Database.dataSource.transaction(async (entityManager) => {
      let deposit = await StripeService.getStripeDeposit(depositId);

      const states = deposit.depositStatus.map((status) => status.state);
      if (states.includes(state)) throw new Error(`Status ${state} already exists.`);
      if (state === StripeDepositState.SUCCEEDED && (states.includes(StripeDepositState.FAILED) || states.includes(StripeDepositState.CANCELED))) {
        throw new Error('Cannot create status SUCCEEDED, because FAILED or CANCELED already exists');
      }
      if (state === StripeDepositState.FAILED && (states.includes(StripeDepositState.SUCCEEDED) || states.includes(StripeDepositState.CANCELED))) {
        throw new Error('Cannot create status FAILED, because SUCCEEDED or CANCELED already exists');
      }
      if (state === StripeDepositState.CANCELED && (states.includes(StripeDepositState.SUCCEEDED) || states.includes(StripeDepositState.FAILED))) {
        throw new Error('Cannot create status CANCELED, because SUCCEEDED or FAILED already exists');
      }

      const depositStatus = Object.assign(new StripeDepositStatus(), { deposit, state });
      await entityManager.save<StripeDepositStatus>(depositStatus);

      // If payment has succeeded, create the transfer
      if (state === StripeDepositState.SUCCEEDED) {
        deposit = await StripeService.getStripeDeposit(depositId, ['to']);
        deposit.transfer = await TransferService.createTransfer({
          amount: {
            amount: deposit.amount.getAmount(),
            precision: deposit.amount.getPrecision(),
            currency: deposit.amount.getCurrency(),
          },
          toId: deposit.to.id,
          description: deposit.stripeId,
          fromId: undefined,
        }, entityManager);

        await deposit.save();
      }

      return depositStatus;
    });
  }

  /**
   * Handle the event by making the appropriate database additions
   * @param event {Stripe.Event} Event received from Stripe webhook
   */
  public async handleWebhookEvent(event: Stripe.Event) {
    try {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const deposit = await StripeDeposit.findOne({
        where: { stripeId: paymentIntent.id },
      });

      switch (event.type) {
        case 'payment_intent.created':
          await StripeService.createNewDepositStatus(deposit.id, StripeDepositState.CREATED);
          break;
        case 'payment_intent.processing':
          await StripeService.createNewDepositStatus(deposit.id, StripeDepositState.PROCESSING);
          break;
        case 'payment_intent.succeeded':
          await StripeService.createNewDepositStatus(deposit.id, StripeDepositState.SUCCEEDED);
          break;
        case 'payment_intent.payment_failed':
          await StripeService.createNewDepositStatus(deposit.id, StripeDepositState.FAILED);
          break;
        default:
          this.logger.warn('Tried to process event', event.type, 'but processing method is not defined');
      }
    } catch (error) {
      this.logger.error('Could not process Stripe webhook event with ID', event.id, error);
    }
  }
}
