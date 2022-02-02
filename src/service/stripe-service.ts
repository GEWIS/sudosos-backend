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
import User from '../entity/user/user';
import StripeDeposit from '../entity/deposit/stripe-deposit';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import StripeDepositStatus, { StripeDepositState } from '../entity/deposit/stripe-deposit-status';
import { StripePaymentIntentResponse } from '../controller/response/stripe-response';

export default class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY, {
      apiVersion: '2020-08-27',
    });
  }

  public static async getStripeDeposit(id: number) {
    return StripeDeposit.findOne(id, {
      relations: ['depositStatus'],
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

    const stripeDepositStatus = Object.assign(new StripeDepositStatus(), {
      state: StripeDepositState.CREATED,
      deposit: stripeDeposit,
    });

    await stripeDepositStatus.save();

    return {
      id: stripeDeposit.id,
      createdAt: stripeDeposit.createdAt.toISOString(),
      updatedAt: stripeDeposit.updatedAt.toISOString(),
      stripeId: stripeDeposit.stripeId,
      clientSecret: paymentIntent.client_secret,
    };
  }
}
