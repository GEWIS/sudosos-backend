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
import { Dinero } from 'dinero.js';
import BaseEntity from '../base-entity';
import User from '../user/user';
import DineroTransformer from '../transformer/dinero-transformer';

export enum TransferType {
  DEPOSIT = 'deposit',
  INVOICE = 'invoice',
  CUSTOM = 'custom',
}

/**
 * @typedef {Transfer} Transfer
 * @property {User.model} from.required - The account from which the transaction is subtracted.
 * @property {User.model} to.required - The account to which the transaction is added.
 * @property {Dinero.model} price.required - The amount of money transferred.
 * @property {TransferType} type.required - The type of transfer
 * @prpoerty {string} description - If the Transfer is of type 'custom', this contains a
 *  description of the transfer
 */
@Entity()
export default class Transfer extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'from' })
  public from: User;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'to' })
  public to: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  /* This snippet does unfortunately not work, because SQLite
     does not support the "enum" column type. For now, use the workaround below.
  @Column({
    type: 'enum',
    enum: UserType,
  })
  public type: UserType; */
  @Column()
  public type: 'deposit' | 'invoice' | 'custom';

  @Column({
    nullable: true,
  })
  public description?: string;
}
