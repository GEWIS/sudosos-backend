/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
import Fine from '../fine/fine';
import UserFineGroup from '../fine/userFineGroup';
import VatGroup from '../vat-group';
import WriteOff from "./write-off";

/**
 * @typedef {BaseEntity} Transfer
 * @property {User.model} from - The account from which the transfer is subtracted. Can be
 * null if money was deposited.
 * @property {User.model} to - The account to which the transaction is added. Can be null if
 * money was paid out.
 * @property {VatGroup.model} vat - The vat group of the transfer
 * @property {Dinero.model} amountInclVat.required - The amount of money transferred.
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
  public amountInclVat: Dinero;

  @ManyToOne(() => VatGroup, { nullable: true })
  public vat?: VatGroup;

  @Column({
    nullable: true,
  })
  public description?: string;

  @OneToOne(() => PayoutRequest, (p) => p.transfer, { nullable: true })
  public payoutRequest: PayoutRequest | null;

  @OneToOne(() => StripeDeposit, (d) => d.transfer, { nullable: true })
  public deposit: StripeDeposit | null;

  @OneToOne(() => Invoice, (i) => i.transfer, { nullable: true })
  public invoice: Invoice | null;

  @OneToOne(() => Fine, (f) => f.transfer, { nullable: true })
  public fine: Fine | null;

  @OneToOne(() => WriteOff, (w) => w.transfer, { nullable: true })
  public writeOff: WriteOff | null;

  @OneToOne(() => UserFineGroup, (g) => g.waivedTransfer, { nullable: true })
  public waivedFines: UserFineGroup | null;
}
