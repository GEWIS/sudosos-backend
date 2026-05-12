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
 * A user's `balance` is the net of every transaction and {@link transfers!Transfer | Transfer}
 * on their account. Positive means SudoSOS owes them; negative means they owe SudoSOS and
 * need to top up.
 *
 * ### Computed, not authoritative
 * The source of truth is {@link transactions!Transaction | Transaction} and
 * {@link transfers!Transfer | Transfer} history. The `Balance` table is a cache, so reading
 * one user's balance does not have to re-sum every
 * {@link transactions/sub-transactions!SubTransactionRow | SubTransactionRow} since their
 * first deposit.
 *
 * ### Cache structure
 * Each row stores the cached `amount` plus a `lastTransactionId` / `lastTransferId` cursor.
 * {@link BalanceService.getBalances | getBalances} returns `cachedAmount + delta`, where the
 * delta sums every sub-transaction row and transfer that happened *after* the cursor. If the
 * cache is out of date the read still returns the correct value; it just costs more SQL.
 *
 * {@link BalanceService.updateBalances | updateBalances} writes a fresh total back to the
 * cache. {@link BalanceService.clearBalanceCache | clearBalanceCache} drops cache rows --
 * useful after bulk-rewriting history.
 *
 * ### What moves a balance
 * Sub-transaction rows debit the
 * {@link transactions/sub-transactions!SubTransaction | SubTransaction} buyer (`fromId`) and
 * credit the seller (`toId`, the container owner). Prices are pinned by the
 * {@link catalogue/products!ProductRevision | ProductRevision} in effect at the time, so
 * editing a product later does not retroactively shift balances.
 *
 * Transfers are the explicit movements outside a transaction: Stripe deposits, fine handouts,
 * fine waivers, payout requests, seller payouts, write-offs, invoices.
 *
 * Undoing either of those writes a compensating row; the original stays in the audit trail.
 *
 * ### Fines on the response
 * {@link BalanceResponse} carries the user's outstanding fine amount, the timestamp of the
 * first fine, the number of fines, and any waived amount. These are "now" values, not
 * historical -- ignore them when `date` is in the past.
 *
 * ### Total balances
 * `GET /balances/summary` adds up positive and negative balances across the database, broken
 * down by {@link users!UserType | UserType}. Treasurers use it to reconcile SudoSOS against
 * the bank account.
 *
 * ### POS users
 * {@link users!UserType.POINT_OF_SALE | POS users} do not hold balances of their own. Their
 * sub-transactions credit the container owner, and balance queries filter POS users out at
 * the SQL level, so they never show up in {@link PaginatedBalanceResponse} or
 * {@link TotalBalanceResponse}.
 *
 * @module balance
 * @mergeTarget
 */

import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import User from '../user/user';
import Transaction from './transaction';
import Transfer from './transfer';
import DineroTransformer from '../transformer/dinero-transformer';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * TypeORM entity for the `balance` table. This is a cache row -- the authoritative balance is
 * recomputed from {@link Transaction} and {@link Transfer} history. `lastTransaction` and
 * `lastTransfer` mark the cursor up to which `amount` is accurate; anything newer is summed
 * on read by `BalanceService`.
 * @typedef {BaseEntityWithoutId} Balance
 * @property {User.model} user.required - The account which has this balance
 * @property {Dinero.model} amount.required - The amount of balance a user has.
 * @property {Transaction.model} lastTransaction - The last transaction of this
 * user, used to calculate this balance
 * @property {Transfer.model} lastTransfer - The last transfer of this user,
 * used to calculate this balance
 */
@Entity()
export default class Balance extends BaseEntityWithoutId {
  @PrimaryColumn({ type: 'integer' })
  public readonly userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public readonly user: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public readonly amount: Dinero;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn()
  public readonly lastTransaction?: Transaction;

  @ManyToOne(() => Transfer, { nullable: true, onDelete: 'CASCADE' })
  public readonly lastTransfer?: Transfer;
}
