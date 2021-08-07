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
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  BaseEntity,
} from 'typeorm';
// eslint-disable-next-line import/no-cycle
import User from '../user/user';

/**
 * @typedef {Balance} Balance
 * @property {User.model} user.required - The account which has this balance
 * @property {Number} amount - The amount of balance a user has.
 * @property {Date>} subtransactions.required - The time of last sync with transactions
 *    to this transaction.
 */
@Entity()
export default class Balance extends BaseEntity {
  @PrimaryColumn({ type: 'integer' })
  public readonly user_id: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  public readonly user: User;

  @Column({ type: 'integer' })
  public readonly amount: number;

  @Column({ type: 'integer' })
  public readonly lastTransaction: number;

  @Column({ type: 'integer' })
  public readonly lastTransfer: number;
}
