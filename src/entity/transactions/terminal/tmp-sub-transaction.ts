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

import { Entity, ManyToOne, OneToMany } from 'typeorm';
import SubTransaction from '../sub-transaction';
import TmpSubTransactionRow from './tmp-sub-transaction-row';
import TmpTransaction from './tmp-transaction';

@Entity()
export default class TmpSubTransaction extends SubTransaction {
  @ManyToOne(() => TmpTransaction,
    (transaction) => transaction.subTransactions,
    { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  public transaction: TmpTransaction;

  @OneToMany(() => TmpSubTransactionRow,
    (subTransactionRow) => subTransactionRow.subTransaction,
    { cascade: true })
  public subTransactionRows: TmpSubTransactionRow[];
}