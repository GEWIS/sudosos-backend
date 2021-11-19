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
  Column, Entity, ManyToOne,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import BaseEntity from '../base-entity';
import User from '../user/user';
import DineroTransformer from '../transformer/dinero-transformer';

export enum TransferType {
  DEPOSIT = 1,
  INVOICE = 2,
  CUSTOM = 3,
}

/**
 * @typedef {BaseEntity} Transfer
 * @property {User.model} from - The account from which the transfer is subtracted. Can be
 * null if money was deposited.
 * @property {User.model} to - The account to which the transaction is added. Can be null if
 * money was paid out.
 * @property {Dinero.model} amount.required - The amount of money transferred.
 * @property {integer} type.required - The type of transfer.
 * @property {string} description - If the transfer is of type 'custom', this contains a
 * description of the transfer.
 */
@Entity()
export default class Transfer extends BaseEntity {
  @ManyToOne(() => User, { nullable: true })
  public from?: User;

  @ManyToOne(() => User, { nullable: true })
  public to?: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @Column({
    nullable: false,
  })
  public type: TransferType;

  @Column({
    nullable: true,
  })
  public description?: string;
}
