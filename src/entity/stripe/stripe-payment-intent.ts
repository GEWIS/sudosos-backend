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
 * This is the module page of the stripe-payment-intent.
 *
 * @module stripe
 */

import BaseEntity from '../base-entity';
import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import StripePaymentIntentStatus from './stripe-payment-intent-status';
import DineroTransformer from '../transformer/dinero-transformer';
import { Dinero } from 'dinero.js';
import StripeDeposit from './stripe-deposit';
import type TerminalPayment from '../transactions/terminal/terminal-payment';
import PaymentRequestAttempt from '../payment-request/payment-request-attempt';

/**
 * @typedef {BaseEntity} StripePaymentIntent
 * @property {Array.<StripePaymentIntentStatus>} paymentIntentStatuses.required - The
 * status updates belonging to this intent. The newest status is the current
 * status.
 * @property {string} stripeId.required - The ID of the transaction on Stripe's side
 * @property {Dinero.model} amount.required - The amount to be paid
 * @property {StripeDeposit.model} deposit - The deposit belonging to this intent
 */
@Entity()
export default class StripePaymentIntent extends BaseEntity {
  @OneToMany(() => StripePaymentIntentStatus,
    (paymentStatus) => paymentStatus.stripePaymentIntent,
    { cascade: true, eager: true })
  @JoinColumn()
  public paymentIntentStatuses: StripePaymentIntentStatus[];

  /**
   * ID of the PaymentIntent as given by Stripe.
   */
  @Column({ unique: true })
  public stripeId: string;

  /**
   * Amount to be paid with Stripe.
   */
  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @OneToOne(() => StripeDeposit, (s) => s.stripePaymentIntent, { nullable: true })
  public deposit: StripeDeposit | null;

  @OneToOne(() => PaymentRequestAttempt, (a) => a.paymentIntent, { nullable: true })
  public paymentRequestAttempt?: PaymentRequestAttempt | null;

  @OneToOne('TerminalPayment', (t: TerminalPayment) => t.stripePaymentIntent, { nullable: true })
  public terminalPayment?: TerminalPayment | null;

  /**
   * Whether this PaymentIntent is cancelled via the API. If the
   * paymentintent.cancelled event is received but this boolean is set to true,
   * no additional action should be taken.
   */
  @Column({ default: false })
  public cancelledWithAPI: boolean;
}
