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
  StripePaymentTerminalResponse,
} from '../controller/response/stripe-response';
import TransferService from './transfer-service';
import { EntityManager, FindOptionsRelations, IsNull } from 'typeorm';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import BalanceResponse from '../controller/response/balance-response';
import { StripeRequest } from '../controller/request/stripe-request';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import WithManager from '../database/with-manager';
import Config from '../config';

export const STRIPE_API_VERSION = '2024-06-20';

export class StripeFactory {
  public static create(): Stripe {
    const config = Config.get();
    if (!config.stripe.privateKey) {
      throw new Error('STRIPE_PRIVATE_KEY environment variable is not set.');
    }

    return new Stripe(config.stripe.privateKey, {
      apiVersion: STRIPE_API_VERSION,
    });
  }
}

export default class StripeService extends WithManager {
  private stripe: Stripe;

  private logger: Logger;

  constructor(manager?: EntityManager) {
    super(manager);
    this.stripe = StripeFactory.create();
    this.logger = log4js.getLogger('StripeController');
  }

  /**
   * Topup should be at least 10 euros or the user's negative balance.
   * @param balance
   * @param request
   */
  public static validateStripeRequestMinimumAmount(balance: BalanceResponse, request: StripeRequest): boolean {
    const minimumTopup = Config.get().stripe.minTopupAmount;

    //check for negative and zero
    if (request.amount.amount <= 0) {
      return false;
    }

    // Check if top-up is enough
    if (request.amount.amount >= minimumTopup) return true;
    return request.amount.amount === -1 * balance.amount.amount;
  }

  /**
   * Topup should be at most 150 euros minus user's positive balance or user's negative balance.
   * @param balance
   * @param request
   */
  public static validateStripeRequestMaximumAmount(balance: BalanceResponse, request: StripeRequest): boolean {
    const maximumBalance = Config.get().stripe.maxBalanceAmount;

    // Check if top-up will not exceed max balance
    return maximumBalance >= (balance.amount.amount + request.amount.amount);
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

  public static async getProcessingStripeDepositsFromUser(userId: number): Promise<StripeDeposit[]> {
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
      relations: {
        to: true,
      },
    });

    return deposits.filter((d) => !d.stripePaymentIntent.paymentIntentStatuses.some(
      (s) => s.state === StripePaymentIntentState.SUCCEEDED
        || s.state === StripePaymentIntentState.FAILED));
  }

  public static async getStripeDeposit(
    id: number,
    relations: FindOptionsRelations<StripeDeposit> = {},
  ): Promise<StripeDeposit> {
    return StripeDeposit.findOne({
      where: { id },
      relations: {
        stripePaymentIntent: { paymentIntentStatuses: true },
        ...relations,
      },
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
   * Create a Stripe Payment Intent and save it to the database
   * @param user For whom the payment intent is for
   * @param amount The amount to be deposited/paid using Stripe
   * @param metadata Optional extra metadata to attach to the payment intent
   * @returns
   */
  public async createStripePaymentIntent(user: User, amount: Dinero, metadata?: Record<string, any>): Promise<{
    stripePaymentIntent: StripePaymentIntent,
    clientSecret: string | null,
  }> {
    const config = Config.get();
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: DineroTransformer.Instance.to(amount),
      currency: amount.getCurrency(),
      automatic_payment_methods: { enabled: true },
      description: `SudoSOS deposit of ${amount.getCurrency()} ${(amount.getAmount() / 100).toFixed(2)} for ${User.fullName(user)}.`,
      metadata: {
        ...metadata,
        'service': config.app.name,
        'userId': user.id,
      },
    });

    const stripePaymentIntent = await this.manager.getRepository(StripePaymentIntent).save({
      stripeId: paymentIntent.id,
      amount,
      paymentIntentStatuses: [],
    });
    return { stripePaymentIntent, clientSecret: paymentIntent.client_secret };
  }

  /**
   * Create deposit with a payment intent and save it to the database
   * @param user User that wants to deposit some money into their account
   * @param amount The amount to be deposited
   * @param metadata Optional metadata to attach to the payment intent
   * @returns The created deposit entity and the Stripe client secret
   */
  public async createStripeDeposit(
    user: User, amount: Dinero, metadata?: Record<string, any>,
  ): Promise<{ deposit: StripeDeposit, clientSecret: string | null }> {
    const { stripePaymentIntent, clientSecret } = await this.createStripePaymentIntent(user, amount, metadata);
    const deposit = await this.manager.getRepository(StripeDeposit).save({
      stripePaymentIntent,
      to: user,
    });

    return {
      deposit,
      clientSecret,
    };
  }

  /**
   * Create the transfer that belongs to the now paid paymentIntent
   * @param paymentIntent Stripe PaymentIntent that has been successfully paid
   */
  public async handleStripeDepositPaid(paymentIntent: StripePaymentIntent) {
    if (!paymentIntent.deposit) throw new Error('Given paymentIntent does not have a deposit');
    if (paymentIntent.deposit.transfer) throw new Error('Given paymentIntent\'s deposit already has a transfer attached');

    paymentIntent.deposit.transfer = await new TransferService(this.manager).createTransfer({
      amount: paymentIntent.amount.toObject(),
      toId: paymentIntent.deposit.to.id,
      description: paymentIntent.stripeId,
      fromId: undefined,
    });

    await this.manager.save(paymentIntent.deposit);
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
      .findOne({
        where: { id: paymentIntentId },
        relations: { deposit: true, paymentRequest: true },
      });
    if (!paymentIntent) {
      throw new Error(`StripePaymentIntent with id ${paymentIntentId} not found.`);
    }

    const states = paymentIntent.paymentIntentStatuses?.map((status) => status.state) ?? [];
    if (states.includes(state)) throw new Error(`Status ${state} already exists.`);
    if (state === StripePaymentIntentState.SUCCEEDED && states.includes(StripePaymentIntentState.FAILED)) {
      throw new Error('Cannot create status SUCCEEDED, because FAILED already exists');
    }
    if (state === StripePaymentIntentState.FAILED && states.includes(StripePaymentIntentState.SUCCEEDED)) {
      throw new Error('Cannot create status FAILED, because SUCCEEDED already exists');
    }

    const depositStatus = await this.manager.getRepository(StripePaymentIntentStatus).save({ stripePaymentIntent: paymentIntent, state });

    return depositStatus;
  }

  /**
   * Get all Stripe Payment Terminals available in Stripe
   */
  public async getTerminals(): Promise<StripePaymentTerminalResponse[]> {
    const terminals = await this.stripe.terminal.readers.list();
    return terminals.data.map((t) => ({
      id: t.id,
      name: t.label,
      available: t.action?.status !== 'in_progress',
    }));
  }

  public async startTerminalPayment(terminalId: string, paymentIntent: string): Promise<void> {
    // @TODO: add error handling
    const reader = await this.stripe.terminal.readers.processPaymentIntent(
      terminalId,
      {
        payment_intent: paymentIntent,
      },
    );
  }
}
