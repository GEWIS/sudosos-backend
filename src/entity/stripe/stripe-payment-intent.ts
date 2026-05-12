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
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import StripePaymentIntentStatus from './stripe-payment-intent-status';
import DineroTransformer from '../transformer/dinero-transformer';
import { Dinero } from 'dinero.js';
import StripeDeposit from './stripe-deposit';
import PaymentRequest from '../payment-request/payment-request';

@Entity()
export default class StripePaymentIntent extends BaseEntity {
  @OneToMany(() => StripePaymentIntentStatus,
    (paymentStatus) => paymentStatus.stripePaymentIntent,
    { cascade: true, eager: true })
  @JoinColumn()
  public paymentIntentStatuses: StripePaymentIntentStatus[];

  @Column({ unique: true })
  public stripeId: string;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @OneToOne(() => StripeDeposit, (s) => s.stripePaymentIntent, { nullable: true })
  public deposit: StripeDeposit | null;

  /**
   * Optional back-reference to a {@link stripe/payment-request!PaymentRequest | PaymentRequest}
   * that initiated this intent. Populated when the intent is created via
   * the PaymentRequest start flow (authenticated or public share-link).
   *
   * The data-model contract is: a single PaymentRequest may have many
   * StripePaymentIntents (retries), but only one of them ever reaches
   * `SUCCEEDED`. The webhook ingestion path in the service layer reads
   * this back-reference to mark the linked request as paid; the wiring
   * itself lives outside this entity (see the service-layer changes).
   */
  @ManyToOne(() => PaymentRequest, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentRequestId' })
  public paymentRequest?: PaymentRequest | null;
}
