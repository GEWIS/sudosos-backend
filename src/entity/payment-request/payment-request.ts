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
 * This is the module page of the payment-request.
 *
 * A `PaymentRequest` is an immutable, unauthenticated, shareable request to
 * top up a specific user's balance with a specific amount before a specific
 * deadline. It is the domain primitive behind what end-users perceive as a
 * "payment link".
 *
 * ## Lifecycle
 *
 * A request is created in `PENDING` state with an `expiresAt` and a fixed
 * `amount`. From there it transitions to exactly one of:
 *
 * - `PAID` — a linked {@link stripe!StripePaymentIntent | StripePaymentIntent}
 *   succeeded and the corresponding void→user `Transfer` was created.
 * - `CANCELLED` — explicitly cancelled by an authorized user (e.g. a wrong
 *   amount was issued and a fresh request will be created instead).
 * - `EXPIRED` — `expiresAt` has passed without payment.
 *
 * Status is **derived**, not stored — see {@link PaymentRequest.status}. The
 * only stored state is `paidAt`, `cancelledAt`, and `expiresAt`.
 *
 * ## Stripe relationship (one-to-many on the inverse side)
 *
 * A request may have many {@link stripe!StripePaymentIntent | StripePaymentIntent}
 * rows over its lifetime — each call to `startPayment` mints a fresh intent
 * (the user can abandon a session and try again). The request becomes "paid"
 * when at least one of those intents reaches `SUCCEEDED` and its
 * `StripeDeposit.transfer` exists.
 *
 * ## Amount immutability
 *
 * The `amount` is fixed at creation time and cannot be mutated. The user-
 * facing email/PDF mentions a specific euro figure; if SudoSOS were to
 * recompute the figure at pay-time (against a moving balance), the email
 * and the actual charge would diverge. To correct a wrong amount, cancel
 * the request and create a new one — never mutate.
 *
 * ## Always credits balance on success
 *
 * A successful payment **always** results in a standard void→user `Transfer`
 * that credits the recipient's balance. `PaymentRequest` is a top-up
 * primitive — callers that do not want a balance credit (e.g. a future
 * "invoice via payment link" flow) must not pre-create their own credit
 * Transfer; the Stripe deposit is the single settlement event.
 *
 * ## Admin escape hatch
 *
 * Reality intrudes: occasionally a user pays a payment-link's invoice via
 * bank transfer instead of iDeal. The admin endpoint
 * `POST /payment-requests/:id/mark-fulfilled` creates the credit Transfer
 * manually (with a reason for audit), flipping the request to `PAID` without
 * a Stripe deposit existing.
 *
 * ## Out of scope (tracked elsewhere)
 *
 * - Linking back to {@link invoicing!Invoice | Invoice}
 *   (`Invoice.paymentRequest?` lives on the invoice side).
 * - Settlement (positive-balance payouts) for disabled users — a separate
 *   primitive, not this one.
 * - Stripe refund handling.
 *
 * @module stripe/payment-request
 * @mergeTarget
 */

import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Dinero } from 'dinero.js';
import BaseEntityWithoutId from '../base-entity-without-id';
import User from '../user/user';
import DineroTransformer from '../transformer/dinero-transformer';
import { PaymentRequestStatus } from './payment-request-status';

/**
 * A shareable, fixed-amount request to top up a specific user's SudoSOS
 * balance. See the module page for full lifecycle and integration notes.
 *
 * @typedef {BaseEntityWithoutId} PaymentRequest
 * @property {string} id.required - UUID v4, also the public identifier shared in the link.
 * @property {User.model} for.required - The user whose balance will be credited on payment.
 * @property {User.model} createdBy.required - The user that issued this request (audit).
 * @property {integer} amount.required - Fixed amount in cents (Dinero); immutable.
 * @property {string} expiresAt.required - When the request stops accepting payments.
 * @property {string} cancelledAt - When the request was cancelled (null if not cancelled).
 * @property {User.model} cancelledBy - The user that cancelled this request (null if not cancelled).
 * @property {string} paidAt - When the request was marked paid (null if pending/cancelled/expired).
 * @property {User.model} fulfilledBy - The admin that marked the request paid out-of-band via the escape hatch (null otherwise).
 * @property {string} description - Human-readable description (e.g. "Drinks at Walhalla naborrel 2026-04-12").
 *
 * @promote
 */
@Entity()
export default class PaymentRequest extends BaseEntityWithoutId {
  /** UUID v4. Also the public-facing identifier shared in payment links. */
  @PrimaryColumn({
    type: 'varchar',
    length: 36,
  })
  public id: string;

  /** The user whose balance will be credited on successful payment. */
  @ManyToOne(() => User, { nullable: false, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'forId' })
  // Keep the domain term: `for` reads naturally as "PaymentRequest for a user".
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public for: User;

  /** Audit: who issued this request. */
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdById' })
  public createdBy: User;

  /** Fixed, immutable amount. */
  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  /** After this moment the request stops accepting payments. */
  @Column({
    type: 'datetime',
  })
  public expiresAt: Date;

  /** When the request was cancelled, null if not cancelled. */
  @Column({
    type: 'datetime',
    nullable: true,
  })
  public cancelledAt: Date | null;

  /** Who cancelled the request (audit), null if not cancelled. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancelledById' })
  public cancelledBy: User | null;

  /** When the request was marked paid (Stripe success or admin override). */
  @Column({
    type: 'datetime',
    nullable: true,
  })
  public paidAt: Date | null;

  /**
   * Audit: the admin that flipped this request to PAID via the out-of-band
   * escape hatch (`markFulfilledExternally`). `null` for Stripe-settled
   * requests — those are unambiguously attributed via the linked
   * `StripePaymentIntent`.
   */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fulfilledById' })
  public fulfilledBy: User | null;

  /** Optional human-readable description for context (e.g. invoice reference). */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  public description: string | null;

  /**
   * Derived status — not persisted. Order of precedence:
   * `PAID` > `CANCELLED` > `EXPIRED` > `PENDING`.
   */
  public get status(): PaymentRequestStatus {
    if (this.paidAt !== null && this.paidAt !== undefined) {
      return PaymentRequestStatus.PAID;
    }
    if (this.cancelledAt !== null && this.cancelledAt !== undefined) {
      return PaymentRequestStatus.CANCELLED;
    }
    if (this.expiresAt < new Date()) {
      return PaymentRequestStatus.EXPIRED;
    }
    return PaymentRequestStatus.PENDING;
  }

  async getOwner(): Promise<User> {
    return this.for;
  }

  constructor() {
    super();
    this.id = uuidv4();
    this.cancelledAt = null;
    this.cancelledBy = null;
    this.paidAt = null;
    this.fulfilledBy = null;
    this.description = null;
  }
}
