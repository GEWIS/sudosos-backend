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

import Stripe from 'stripe';
import { Dinero } from 'dinero.js';
import { getLogger, Logger } from 'log4js';
import User from '../entity/user/user';
import StripeDeposit from '../entity/stripe/stripe-deposit';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import StripePaymentIntentStatus, { StripePaymentIntentState } from '../entity/stripe/stripe-payment-intent-status';
import {
  StripeDepositResponse,
  StripeDepositStatusResponse,
  StripePaymentIntentResponse,
} from '../controller/response/stripe-response';
import TransferService from './transfer-service';
import { EntityManager, IsNull } from 'typeorm';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import wrapInManager from '../helpers/database';
import BalanceResponse from '../controller/response/balance-response';
import { StripeRequest } from '../controller/request/stripe-request';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';

export const STRIPE_API_VERSION = '2024-06-20';

export default class StripeService {
  private stripe: Stripe;

  private logger: Logger;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });
    this.logger = getLogger('StripeController');
  }

  /**
   * Topup should be at least 10 euros or the user's negative balance.
   * @param balance
   * @param request
   */
  public static validateStripeRequestMinimumAmount(balance: BalanceResponse, request: StripeRequest): boolean {
    const MIN_TOPUP = process.env.MIN_TOPUP || 1000;

    // Check if top-up is enough
    if (request.amount.amount >= MIN_TOPUP) return true;
    return request.amount.amount === -1 * balance.amount.amount;
  }

  /**
   * Topup should be at most 150 euros minus user's positive balance or user's negative balance.
   * @param balance
   * @param request
   */
  public static validateStripeRequestMaximumAmount(balance: BalanceResponse, request: StripeRequest): boolean {
    const MAX_BALANCE = process.env.MAX_BALANCE || 15000;

    // Check if top-up will not exceed max balance
    return MAX_BALANCE >= (balance.amount.amount + request.amount.amount);
  }

  private static asStripeDepositStatusResponse(status: StripePaymentIntentStatus): StripeDepositStatusResponse {
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
      stripeId: deposit.stripePaymentIntent.stripeId,
      depositStatus: deposit.stripePaymentIntent.paymentIntentStatuses.map((s) => this.asStripeDepositStatusResponse(s)),
      amount: deposit.stripePaymentIntent.amount.toObject(),
      to: parseUserToBaseResponse(deposit.to, true),
    };
  }

  public static async getProcessingStripeDepositsFromUser(userId: number): Promise<StripeDepositResponse[]> {
    const deposits = await StripeDeposit.find({
      where: {
        to: {
          id: userId,
        },
        transfer: IsNull(),
        stripePaymentIntent: {
          paymentIntentStatuses: {
            state: StripePaymentIntentState.PROCESSING,
          },
        },
      },
      relations: ['to'],
    });

    return deposits.filter((d) => !d.stripePaymentIntent.paymentIntentStatuses.some(
      (s) => s.state === StripePaymentIntentState.SUCCEEDED
        || s.state === StripePaymentIntentState.FAILED))
      .map((d) => this.asStripeDepositResponse(d));
  }

  public static async getStripeDeposit(id: number, relations: string[] = []): Promise<StripeDeposit> {
    return StripeDeposit.findOne({
      where: { id },
      relations: ['stripePaymentIntent', 'stripePaymentIntent.paymentIntentStatuses'].concat(relations),
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

    const stripePaymentIntent = await StripePaymentIntent.save({
      stripeId: paymentIntent.id,
      amount,
      paymentIntentStatuses: [],
    });
    const stripeDeposit = await StripeDeposit.save({
      stripePaymentIntent,
      to: user,
    });

    return {
      id: stripeDeposit.id,
      createdAt: stripeDeposit.createdAt.toISOString(),
      updatedAt: stripeDeposit.updatedAt.toISOString(),
      stripeId: stripePaymentIntent.stripeId,
      clientSecret: paymentIntent.client_secret,
    };
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
   * @param manager
   * @param paymentIntentId
   * @param state
   */
  public static async createNewPaymentIntentStatus(
    manager: EntityManager, paymentIntentId: number, state: StripePaymentIntentState,
  ): Promise<StripePaymentIntentStatus> {
    const paymentIntent = await manager.getRepository(StripePaymentIntent)
      .findOne({ where: { id: paymentIntentId } });

    const states = paymentIntent.paymentIntentStatuses?.map((status) => status.state) ?? [];
    if (states.includes(state)) throw new Error(`Status ${state} already exists.`);
    if (state === StripePaymentIntentState.SUCCEEDED && states.includes(StripePaymentIntentState.FAILED)) {
      throw new Error('Cannot create status SUCCEEDED, because FAILED already exists');
    }
    if (state === StripePaymentIntentState.FAILED && states.includes(StripePaymentIntentState.SUCCEEDED)) {
      throw new Error('Cannot create status FAILED, because SUCCEEDED already exists');
    }

    const depositStatus = await manager.getRepository(StripePaymentIntentStatus).save({ stripePaymentIntent: paymentIntent, state });

    // If payment has succeeded, create the transfer
    if (state === StripePaymentIntentState.SUCCEEDED && paymentIntent.deposit) {
      paymentIntent.deposit.transfer = await TransferService.createTransfer({
        amount: {
          amount: paymentIntent.amount.getAmount(),
          precision: paymentIntent.amount.getPrecision(),
          currency: paymentIntent.amount.getCurrency(),
        },
        toId: paymentIntent.deposit.to.id,
        description: paymentIntent.stripeId,
        fromId: undefined,
      }, manager);

      await manager.save(paymentIntent.deposit);
    }

    return depositStatus;
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

      switch (event.type) {
        case 'payment_intent.created':
          await wrapInManager(StripeService.createNewPaymentIntentStatus)(paymentIntent.id, StripePaymentIntentState.CREATED);
          break;
        case 'payment_intent.processing':
          await wrapInManager(StripeService.createNewPaymentIntentStatus)(paymentIntent.id, StripePaymentIntentState.PROCESSING);
          break;
        case 'payment_intent.succeeded':
          await wrapInManager(StripeService.createNewPaymentIntentStatus)(paymentIntent.id, StripePaymentIntentState.SUCCEEDED);
          break;
        case 'payment_intent.payment_failed':
          await wrapInManager(StripeService.createNewPaymentIntentStatus)(paymentIntent.id, StripePaymentIntentState.FAILED);
          break;
        default:
          this.logger.warn('Tried to process event', event.type, 'but processing method is not defined');
      }
    } catch (error) {
      this.logger.error('Could not process Stripe webhook event with ID', event.id, error);
    }
  }
}
