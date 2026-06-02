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
 * A `fine` is a small penalty (capped at 5 EUR per round) applied to a user with a
 * persistently negative {@link balance!Balance | Balance}. Fines are handed out in batches
 * as a debtor-recovery step, not as a per-transaction fee. The amount is
 * `min(5 EUR, floor(-balance / 5 EUR) * 1 EUR)`, never negative, so a user at -3.40 EUR
 * gets nothing and a user at -42 EUR still gets only 5 EUR.
 *
 * ### Three entities, one story
 * - {@link FineHandoutEvent} is one batch. A single `POST /fines/handout` creates one event
 *   that groups every fine handed out in that round, records the `referenceDate` the fines
 *   were calculated against, and the admin who triggered the run.
 * - {@link Fine} is one user's slice of a batch. Each fine owns a debit
 *   {@link transfers!Transfer | Transfer} that moves the penalty off the user's balance.
 * - {@link UserFineGroup} is the per-user wrapper that ties every fine a user has ever
 *   received together and (optionally) holds the `waivedTransfer` that cancels them.
 *   {@link users!User | User.currentFines} points to it while the user still owes; a user
 *   has at most one open group at a time.
 *
 * ### Lifecycle
 * An admin (typically the financial responsible) hands out fines manually. There is no
 * cron. The typical sequence is:
 *
 * 1. `GET /fines/eligible` returns users who are below -5 EUR both now and on the reference
 *    date ({@link debtors!DebtorService.calculateFinesOnDate | calculateFinesOnDate}). The
 *    double check exists so a user who just topped up does not get fined for a historical
 *    low.
 * 2. `POST /fines/notify` sends a warning email
 *    ({@link debtors!DebtorService.sendFineWarnings | sendFineWarnings}) so users have a
 *    grace period to top up.
 * 3. `POST /fines/handout` runs the actual handout in one database transaction
 *    ({@link debtors!DebtorService.handOutFines | handOutFines}): one
 *    {@link FineHandoutEvent}, one {@link Fine} per eligible user, one debit
 *    {@link transfers!Transfer | Transfer} per fine, and one notification per fined user.
 *
 * ### Waiving
 * `POST /users/{id}/fines/waive` creates a credit
 * {@link transfers!Transfer | Transfer} on the user's {@link UserFineGroup} as
 * `waivedTransfer`. Waiving is replace-not-append: if the group already has a waived
 * transfer it is removed and a fresh one is created with the new total. Waiving the full
 * outstanding amount nulls {@link users!User | User.currentFines}, even if the user's
 * balance is still negative.
 *
 * ### Undoing
 * `DELETE /fines/single/{id}` removes one fine and its debit transfer; if that was the
 * only fine in the group, the {@link UserFineGroup} goes too.
 * `DELETE /fines/handout/{id}` rolls back a whole batch the same way. Both delete instead
 * of writing a compensating row; fines are the rare exception to the rule that nothing on
 * the ledger disappears.
 *
 * ### Reflection on the balance
 * {@link balance!Balance | Balance} treats fine and waiver transfers like any other
 * transfer. On top of that, {@link balance!BalanceResponse | BalanceResponse} surfaces
 * the fine state as four "now" fields: `fine` (outstanding), `fineSince` (timestamp of
 * the first fine), `nrFines` (count), and `fineWaived` (amount already waived). Those
 * fields are not historical, so ignore them when `date` is in the past.
 *
 * ### Reporting
 * `GET /fines/report?fromDate=...&tillDate=...` returns aggregate handed-out and waived
 * totals for treasurer reconciliation; `GET /fines/report/pdf` produces the printable
 * version. The service orchestrating everything above lives in {@link debtors | debtors}.
 *
 * @module fines
 * @mergeTarget
 */

import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import User from '../user/user';
import Fine from './fine';
import BaseEntity from '../base-entity';
import Transfer from '../transactions/transfer';

@Entity()
export default class UserFineGroup extends BaseEntity {
  @Column({ type: 'integer' })
  public readonly userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @OneToMany(() => Fine, (fine) => fine.userFineGroup)
  public fines: Fine[];

  @OneToOne(() => Transfer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  public waivedTransfer?: Transfer | null;
}
