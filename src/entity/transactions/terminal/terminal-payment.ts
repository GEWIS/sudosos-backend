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
 * This is the module page of the transaction.
 *
 * @module transactions
 * @mergeTarget
 */

import { Entity, JoinColumn, OneToOne } from 'typeorm';
import BaseEntity from '../../base-entity';
import StripePaymentIntent from '../../stripe/stripe-payment-intent';
import Transfer from '../transfer';
import Transaction from '../transaction';
import TmpTransaction from './tmp-transaction';

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
 */
@Entity()
export default class TerminalPayment extends BaseEntity {
  @OneToOne(() => StripePaymentIntent, { nullable: false, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public stripePaymentIntent: StripePaymentIntent;

  @OneToOne(() => Transfer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn()
  public transfer?: Transfer;

  /**
   * Transaction that was paid with this payment
   */
  @OneToOne(() => Transaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public finalTransaction?: Transaction;

  /**
   * Transaction to be created when the payment is successful
   */
  @OneToOne(() => TmpTransaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public temporaryTransaction?: TmpTransaction;
}