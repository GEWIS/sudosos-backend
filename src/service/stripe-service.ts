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
import { STRIPE_API_VERSION } from './stripe-api-version';

export { STRIPE_API_VERSION };

/**
 * A normalised view of a Stripe Terminal reader, as used internally by
 * SudoSOS. Derived from the Stripe SDK's reader object in
 * {@link StripeService.getTerminals}.
 */
export interface StripePaymentTerminal {
  /** The Stripe reader ID. */
  id: string;
  /** The human-readable label configured for the reader in Stripe. */
  name: string;
  /** When the reader last contacted Stripe. */
  lastSeenAt: Date;
  /** Whether the reader is free to start a new payment (not mid-action). */
  available: boolean;
}

export class StripeFactory {
  /**
   * Create a configured Stripe SDK client using the private key from the
   * application config.
   * @throws Error when the `STRIPE_PRIVATE_KEY` environment variable is not set.
   */
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
    this.logger = log4js.getLogger('StripeService');
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

  /**
   * Convert an internal {@link StripePaymentTerminal} into its API response shape.
   * @param terminal
   */
  public static asStripePaymentTerminalResponse(terminal: StripePaymentTerminal): StripePaymentTerminalResponse {
    return {
      id: terminal.id,
      name: terminal.name,
      lastSeenAt: terminal.lastSeenAt.toISOString(),
      available: terminal.available,
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
   * @param paymentMethod The payment method to use: 'digital' for an online
   * deposit (automatic payment methods) or 'terminal' for a card-present
   * payment captured automatically by a Stripe Terminal.
   * @param metadata Optional extra metadata to attach to the payment intent
   * @returns The saved {@link StripePaymentIntent} and the Stripe client secret
   * (null when Stripe does not return one).
   */
  public async createStripePaymentIntent(user: User, amount: Dinero, paymentMethod: 'digital' | 'terminal', metadata?: Record<string, any>): Promise<{
    stripePaymentIntent: StripePaymentIntent,
    clientSecret: string | null,
  }> {
    const config = Config.get();

    let paymentIntent: Stripe.Response<Stripe.PaymentIntent>;
    if (paymentMethod === 'digital') {
      paymentIntent = await this.stripe.paymentIntents.create({
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
    } else if (paymentMethod === 'terminal') {
      paymentIntent = await this.stripe.paymentIntents.create({
        amount: DineroTransformer.Instance.to(amount),
        currency: amount.getCurrency(),
        payment_method_types: [
          'card_present',
        ],
        capture_method: 'automatic',
        description: `SudoSOS terminal payment of ${amount.getCurrency()} ${(amount.getAmount() / 100).toFixed(2)} for ${User.fullName(user)}.`,
        metadata: {
          ...metadata,
          'service': config.app.name,
          'userId': user.id,
        },
      });
    }

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
    const { stripePaymentIntent, clientSecret } = await this.createStripePaymentIntent(user, amount, 'digital', metadata);
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
   * Cancel the in-progress action (e.g. a payment being collected) on a Stripe
   * Terminal reader, freeing it up for a new payment.
   * @param readerId The Stripe reader ID whose current action should be cancelled.
   * @returns The updated Stripe reader.
   */
  public async cancelTerminalAction(readerId: string) {
    const terminal = await this.stripe.terminal.readers.cancelAction(readerId);
    return terminal;
  }

  /**
   * Cancel a payment intent on Stripe. Note that this will trigger a webhook
   * by Stripe, which should be handled correctly to prevent infinite loops.
   * @param paymentIntent
   */
  public async cancelPaymentIntent(paymentIntent: StripePaymentIntent) {
    paymentIntent.cancelledWithAPI = true;
    await this.stripe.paymentIntents.cancel(paymentIntent.stripeId);
    await this.manager.save(paymentIntent);
    return paymentIntent;
  }

  /**
   * Get all Stripe Payment Terminals available in Stripe
   */
  public async getTerminals(): Promise<StripePaymentTerminal[]> {
    const terminals = await this.stripe.terminal.readers.list();

    return terminals.data.map((t) => {
      return {
        id: t.id,
        name: t.label,
        lastSeenAt: new Date(t.last_seen_at),
        available: t.action?.status !== 'in_progress',
      };
    });
  }

  /**
   * Get the Stripe Payment Terminal with the given ID
   */
  public async getSingleTerminal(id: string): Promise<StripePaymentTerminal | null> {
    const terminals = await this.getTerminals();
    const match = terminals.find((t) => t.id === id);
    if (!match) return null;
    return match;
  }

  /**
   * Instruct a Stripe Terminal reader to start collecting payment for the
   * given payment intent.
   * WATCH OUT: when a terminal is already processing a payment, this "new"
   * payment will silently override the existing payment! Only call this
   * method when you are sure that the reader is available.
   * @param terminalId The Stripe reader ID that should process the payment.
   * @param paymentIntent The Stripe ID of the payment intent to collect.
   */
  public async startTerminalPayment(terminalId: string, paymentIntent: string): Promise<void> {
    await this.stripe.terminal.readers.processPaymentIntent(
      terminalId,
      {
        payment_intent: paymentIntent,
      },
    );
  }
}
