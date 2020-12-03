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
  Entity, Column, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import Subtransaction from './subtransaction';
import User from './user';
import DineroTransformer from './transformer/dinero-transformer';
import BaseEntity from './base-entity';

/**
 * @typedef {BaseEntityWithoutId} Transaction
 * @property {User.model} from.required - The account from which the transaction is subtracted.
 * @property {User.model} to.required - The user to which the transaction is added.
 * @property {User.model} createdBy - The user that created the transaction, if not same as 'from'.
 * @property {decimal} balance.required - The total balance processed in the transaction.
 * @property {Array.<Subtransaction>} subtransactions.required - The subtransactions belonging to
 *    this transaction.
 */
@Entity()
export default class Transaction extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'from' })
  public from: User;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'to' })
  public to: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  public createdBy?: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public balance: Dinero;

  @OneToMany(() => Subtransaction, (subtransaction) => subtransaction.transaction)
  public subtransactions: Subtransaction;
}
