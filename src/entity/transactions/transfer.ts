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
  Column, Entity, JoinColumn, ManyToOne, OneToOne,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import BaseEntity from '../base-entity';
import User from '../user/user';
import DineroTransformer from '../transformer/dinero-transformer';
import PayoutRequest from './payout-request';
import StripeDeposit from '../deposit/stripe-deposit';
import Invoice from '../invoices/invoice';

/**
 * @typedef {BaseEntity} Transfer
 * @property {User} from - The account from which the transfer is subtracted. Can be
 * null if money was deposited.
 * @property {User} to - The account to which the transaction is added. Can be null if
 * money was paid out.
 * @property {Dinero} amount.required - The amount of money transferred.
 * @property {integer} type.required - The type of transfer.
 * @property {string} description - If the transfer is of type 'custom', this contains a
 * description of the transfer.
 */
@Entity()
export default class Transfer extends BaseEntity {
  // These IDs are required, because TypeORM findOptions will convert the relations from LEFT JOIN
  // to INNER JOIN when having a where clause on a relational entity.
  @Column({ nullable: true })
  public fromId?: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'fromId' })
  public from?: User;

  // These IDs are required, because TypeORM findOptions will convert the relations from LEFT JOIN
  // to INNER JOIN when having a where clause on a relational entity.
  @Column({ nullable: true })
  public toId?: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'toId' })
  public to?: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @Column({
    nullable: true,
  })
  public description?: string;

  @OneToOne(() => PayoutRequest, (p) => p.transfer, { nullable: true })
  public payoutRequest?: PayoutRequest;

  @OneToOne(() => StripeDeposit, (d) => d.transfer, { nullable: true })
  public deposit?: StripeDeposit;

  @OneToOne(() => Invoice, (i) => i.transfer, { nullable: true })
  public invoice?: Invoice;
}
