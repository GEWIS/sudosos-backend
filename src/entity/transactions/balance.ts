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
  BaseEntity,
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

/**
 * @typedef {Balance} Balance
 * @property {User.model} user.required - The account which has this balance
 * @property {Dinero.model} amount.required - The amount of balance a user has.
 * @property {Transaction.model} lastTransaction - The last transaction of this
 * user, used to calculate this balance
 * @property {Transfer.model} lastTransfer - The last transfer of this user,
 * used to calculate this balance
 */
@Entity()
export default class Balance extends BaseEntity {
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
