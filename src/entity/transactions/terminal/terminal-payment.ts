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
 * A `Terminal-Payment` is a transaction that is immediately paid for using
 * Stripe. This is done by creating a positive transfer of the same total
 * amount as the transaction, and creating it just before the transaction. In
 * practice, TerminalPayments are most often done when people that incidentally
 * want to order something can pay for their order. A SudoSOS account is not
 * necessary.
 *
 * ### Basic flow
 * A TerminalPayment is created like a transaction. The same validation is
 * done, but the major difference is that TerminalPayments can also be
 * "anonymous". In this case, the transaction's `fromUser` is the
 * point-of-sale user (a {@link users!User | User} of type `POINT_OF_SALE`).
 * Then, the created TerminalPayment is sent
 * to a Stripe Terminal, also called a Reader within Stripe. The reader
 * can then execute a card payment and handshake this with SudoSOS. When the
 * payment is done, SudoSOS creates the transfer and the transaction, thus
 * keeping the user's balance the same.
 *
 * ### Temporary Transactions
 * Before the payment on the terminal starst, the transaction must be
 * immutable. Otherwise, SudoSOS could create a transaction for something the
 * customer did not pay for. Therefore
 * {@link TmpTransaction | Temporary Transactions} have been introduced. These
 * entities are exact copies of {@link Transaction}, except that
 * they are not part of the ledger. When a TerminalPayment has succeeded or is
 * cancelled, these are removed as well.
 *
 * ### Immutable TerminalPayments
 * Terminal Payments are immutable, meaning that they cannot be changed once
 * created. When a change needs to be made to its transaction (for example when
 * a product needs to be removed/added), the "old" `TerminalPayment` must be
 * cancelled and a new one must be created.
 *
 * ### Lifecycle
 * Each `TerminalPayment` has a state:
 * - `CREATED` - The payment is created, but is yet to be paid.
 * - `PROCESSING` - The payment is currently being handled by a reader.
 * - `PAID` - The payment is done.
 * - `CANCELLED` - The payment has been aborted.
 * Status is *derived*, not stored - see {@link TerminalPayment.getState}.
 *
 * ### Terminal Reader behaviour
 * The terminal reader is fully controlled by SudoSOS. There are no options to
 * create transactions on the terminal. It is also not possible to cancel/abort
 * a payment. This must all be done via SudoSOS.
 *
 * @module stripe/terminal-payment
 * @mergeTarget
 */

import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import BaseEntity from '../../base-entity';
import StripePaymentIntent from '../../stripe/stripe-payment-intent';
import Transfer from '../transfer';
import Transaction from '../transaction';
import TmpTransaction from './tmp-transaction';
import User from '../../user/user';

export enum TerminalPaymentState {
  /**
   * Transaction is created, not yet paid
   */
  CREATED = 'created',

  /**
   * Transaction is being paid
   */
  PROCESSING = 'processing',

  /**
   * Transaction is paid
   */
  PAID = 'paid',

  /**
   * Transaction has been aborted
   */
  CANCELLED = 'cancelled',
}

/**
 * @typedef {BaseEntity} TerminalPayment
 * @property {StripePaymentIntent.Model} stripePaymentIntent.required - The
 * intent belonging to this payment.
 * @property {Transfer.model} transfer - The created transfer when payment is
 * successful
 * @property {Transaction.model} finalTransaction - The transaction that was
 * paid with this payment
 * @property {TmpTransaction.model} temporaryTransaction - The transaction that
 * should be created when payment is successful
 * @property {User.model} createdBy.required - The user who created this
 * terminal payment
 * @property {string} processedByTerminal - The ID of the Stripe terminal
 * currently processing this payment, if any
 */
@Entity()
export default class TerminalPayment extends BaseEntity {
  @OneToOne(() => StripePaymentIntent, { nullable: false, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public stripePaymentIntent: StripePaymentIntent;

  @OneToOne(() => Transfer, { nullable: true, onDelete: 'CASCADE', eager: true })
  @JoinColumn()
  public transfer?: Transfer | null;

  /**
   * Transaction that was paid with this payment
   */
  @OneToOne(() => Transaction, { nullable: true, eager: true })
  @JoinColumn()
  public finalTransaction?: Transaction | null;

  /**
   * Transaction to be created when the payment is successful
   */
  @OneToOne(() => TmpTransaction, { nullable: true, eager: true })
  @JoinColumn()
  public temporaryTransaction?: TmpTransaction | null;

  /**
   * The user who created this TerminalPayment
   */
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn()
  public createdBy: User;

  /**
   * The terminal ID that is processing this payment
   */
  @Column({ nullable: true })
  public processedByTerminal?: string;

  /**
   * Determine the terminal payment's state based on the entity's properties
   */
  public getState(): TerminalPaymentState {
    if (this.finalTransaction) return TerminalPaymentState.PAID;

    // No transaction attached to this TerminalPayment.
    if (!this.temporaryTransaction) return TerminalPaymentState.CANCELLED;

    // Terminal assigned, so processing
    if (this.processedByTerminal) return TerminalPaymentState.PROCESSING;

    return TerminalPaymentState.CREATED;
  }
}
