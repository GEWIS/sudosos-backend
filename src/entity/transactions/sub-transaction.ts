/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
/* eslint-disable import/no-cycle */
import {
  Entity, ManyToOne, OneToMany,
} from 'typeorm';
import Transaction from './transaction';
import BaseEntity from '../base-entity';
import User from '../user/user';
import ContainerRevision from '../container/container-revision';
import SubTransactionRow from './sub-transaction-row';

/**
 * @typedef {BaseEntityWithoutId} SubTransaction
 * @property {User.model} to.required - The account that the transaction is added to.
 * @property {Container.model} container.required - The container from which all products in the
 *     SubTransactionRows are bought
 * @property {Transaction.model} transaction.required - The parent transaction
 * @property {Array.<SubTransactionRow>} subTransactionsRows.required - The rows of this
 *     SubTransaction
 */
@Entity()
export default class SubTransaction extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  public to: User;

  @ManyToOne(() => ContainerRevision, { nullable: false })
  public container: ContainerRevision;

  @ManyToOne(() => Transaction,
    (transaction) => transaction.subTransactions,
    { nullable: false, onDelete: 'CASCADE' })
  public transaction: Transaction;

  @OneToMany(() => SubTransactionRow,
    (subtransactionRow) => subtransactionRow.subTransaction,
    { cascade: true })
  public subTransactionRows: SubTransactionRow[];
}
