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
import {
  Column, Entity, JoinColumn, ManyToOne,
} from 'typeorm';
import BaseEntity from './base-entity';
import User from './user';
import Transaction from './transaction';

/**
 * @typedef {FlaggedTransaction} Transaction
 * @property {FlaggedTransactionStatus} status.required - The status of this flag
 * @property {User.model} flaggedBy.required - The user created this flag
 * @property {string} reason.required - The reason why this transaction should be changed
 * @property {Transaction.model} transaction.required - The transaction that has been flagged
 */
@Entity()
export default class FlaggedTransaction extends BaseEntity {
  public status: FlaggedTransactionStatus;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'flaggedBy' })
  public flaggedBy: User;

  @Column({
    length: 1024,
  })
  public reason: string;

  @ManyToOne(() => Transaction, { nullable: false })
  @JoinColumn({ name: 'transaction' })
  public transaction: Transaction;
}

interface FlaggedTransactionStatus {
  TODO: 'todo',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
}
