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
import { Entity, OneToMany } from 'typeorm';
import Transaction from '../transaction';
import TmpSubTransaction from './tmp-sub-transaction';

/**
 * @typedef {Transaction} {TmpTransaction} A transaction that should be
 * stored in the database, for example when paying for it using a terminal.
 * @property {Array.<TmpSubTransaction>} subtransactions.required
 */
@Entity()
export default class TmpTransaction extends Transaction {
  @OneToMany(() => TmpSubTransaction,
    (subTransaction) => subTransaction.transaction,
    { cascade: true, onUpdate: 'CASCADE' })
  public subTransactions: TmpSubTransaction[];
}