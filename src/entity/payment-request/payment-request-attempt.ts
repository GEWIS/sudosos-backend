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
import { Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn } from 'typeorm';
import BaseEntityWithoutId from '../base-entity-without-id';
import PaymentRequest from './payment-request';
import StripePaymentIntent from '../stripe/stripe-payment-intent';

/**
 * The data-model contract is: a single PaymentRequest may have many
 * StripePaymentIntents (retries), but only one of them ever reaches
 * `SUCCEEDED`. The webhook ingestion path in the service layer reads
 * this back-reference to mark the linked request as paid; the wiring
 * itself lives outside this entity (see the service-layer changes).
 */
@Entity()
export default class PaymentRequestAttempt extends BaseEntityWithoutId {
  @PrimaryColumn()
  public paymentRequestUuid: string;

  @ManyToOne(() => PaymentRequest, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'paymentRequestUuid' })
  public paymentRequest: PaymentRequest;

  @PrimaryColumn()
  public paymentIntentId: number;

  @OneToOne(() => StripePaymentIntent, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'paymentIntentId' })
  public paymentIntent: StripePaymentIntent;
}
