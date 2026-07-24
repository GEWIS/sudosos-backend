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
 * This is the module page of the sub-transaction-row.
 *
 * @module transactions
 * @mergeTarget
 */
import { Entity, ManyToOne } from 'typeorm';
import SubTransactionRow from '../sub-transaction-row';
import TmpSubTransaction from './tmp-sub-transaction';

/**
 * @typedef {SubTransactionRow} {TmpSubTransactionRow} The temporary counterpart
 * of a {@link SubTransactionRow}, belonging to a {@link TmpSubTransaction}. Used
 * while a terminal payment is pending, so the order is immutable but not yet
 * part of the ledger.
 * @property {TmpSubTransaction.model} subTransaction.required - The temporary
 * sub-transaction this row belongs to.
 */
@Entity()
export default class TmpSubTransactionRow extends SubTransactionRow {
  @ManyToOne(() => TmpSubTransaction,
    (subTransaction) => subTransaction.subTransactionRows,
    { nullable: false, onDelete: 'CASCADE' })
  public subTransaction: TmpSubTransaction;
}