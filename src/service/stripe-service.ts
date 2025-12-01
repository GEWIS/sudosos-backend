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
 *
 *  @license
 */

/**
 * This is the module page of the stripe-service.
 *
 * @module stripe
 */

import Stripe from 'stripe';
import { Dinero } from 'dinero.js';
import log4js, { Logger } from 'log4js';
import User from '../entity/user/user';
import StripeDeposit from '../entity/stripe/stripe-deposit';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import StripePaymentIntentStatus, { StripePaymentIntentState } from '../entity/stripe/stripe-payment-intent-status';
import {
  StripeDepositResponse,
  StripePaymentIntentStatusResponse,
  StripePaymentIntentResponse,
} from '../controller/response/stripe-response';
import TransferService from './transfer-service';
import { EntityManager, IsNull } from 'typeorm';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import BalanceResponse from '../controller/response/balance-response';
import { StripeRequest } from '../controller/request/stripe-request';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import { asNumber } from '../helpers/validators';
import WithManager from '../database/with-manager';

export const STRIPE_API_VERSION = '2024-06-20';

export default class StripeService extends WithManager {
  private stripe: Stripe;

  private logger: Logger;

  constructor(manager?: EntityManager) {
    super(manager);
    this.stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });
    this.logger = log4js.getLogger('StripeController');
  }

  /**
   * Topup should be at least 10 euros or the user's negative balance.
   * @param balance
   * @param request
   */
  public static validateStripeRequestMinimumAmount(balance: BalanceResponse, request: StripeRequest): boolean {
    const MIN_TOPUP = asNumber(process.env.MIN_TOPUP) || 1000;

    //check for negative and zero 
    if (request.amount.amount <= 0) {
      return false;
    }
    
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
    const MAX_BALANCE = asNumber(process.env.MAX_BALANCE) || 15000;

    // Check if top-up will not exceed max balance
    return MAX_BALANCE >= (balance.amount.amount + request.amount.amount);
  }

  private static asStripePaymentIntentStatusResponse(status: StripePaymentIntentStatus): StripePaymentIntentStatusResponse {
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
      depositStatus: deposit.stripePaymentIntent.paymentIntentStatuses.map((s) => this.asStripePaymentIntentStatusResponse(s)),
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
   * Get a payment intent with the given ID, if it exists
   * @param stripeId
   */
  public async getPaymentIntent(stripeId: string): Promise<StripePaymentIntent | null> {
    return this.manager.getRepository(StripePaymentIntent).findOne({ where: { stripeId } });
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
      description: `SudoSOS deposit of ${amount.getCurrency()} ${(amount.getAmount() / 100).toFixed(2)} for ${User.fullName(user)}.`,
      metadata: {
        'service': process.env.NAME ?? 'sudosos-unknown',
        'userId': user.id,
      },
    });

    const stripePaymentIntent = await this.manager.getRepository(StripePaymentIntent).save({
      stripeId: paymentIntent.id,
      amount,
      paymentIntentStatuses: [],
    });
    const stripeDeposit = await this.manager.getRepository(StripeDeposit).save({
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
   * @param paymentIntentId
   * @param state
   */
  public async createNewPaymentIntentStatus(
    paymentIntentId: number, state: StripePaymentIntentState,
  ): Promise<StripePaymentIntentStatus> {
    const paymentIntent = await this.manager.getRepository(StripePaymentIntent)
      .findOne({ where: { id: paymentIntentId }, relations: { deposit: true } });

    const states = paymentIntent.paymentIntentStatuses?.map((status) => status.state) ?? [];
    if (states.includes(state)) throw new Error(`Status ${state} already exists.`);
    if (state === StripePaymentIntentState.SUCCEEDED && states.includes(StripePaymentIntentState.FAILED)) {
      throw new Error('Cannot create status SUCCEEDED, because FAILED already exists');
    }
    if (state === StripePaymentIntentState.FAILED && states.includes(StripePaymentIntentState.SUCCEEDED)) {
      throw new Error('Cannot create status FAILED, because SUCCEEDED already exists');
    }

    const depositStatus = await this.manager.getRepository(StripePaymentIntentStatus).save({ stripePaymentIntent: paymentIntent, state });

    // If payment has succeeded, create the transfer
    if (state === StripePaymentIntentState.SUCCEEDED && paymentIntent.deposit) {
      paymentIntent.deposit.transfer = await new TransferService(this.manager).createTransfer({
        amount: paymentIntent.amount.toObject(),
        toId: paymentIntent.deposit.to.id,
        description: paymentIntent.stripeId,
        fromId: undefined,
      });

      await this.manager.save(paymentIntent.deposit);
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
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.CREATED);
          break;
        case 'payment_intent.processing':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.PROCESSING);
          break;
        case 'payment_intent.succeeded':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.SUCCEEDED);
          break;
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled':
          await this.createNewPaymentIntentStatus(paymentIntent.id, StripePaymentIntentState.FAILED);
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
