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
 *
 *  @license
 */

/**
 * This is the module page of the invoice-user.
 *
 * @module invoices
 */

import {
  Column, Entity, JoinColumn, OneToOne, PrimaryColumn,
} from 'typeorm';

import User from './user';
import BaseEntityWithoutId from '../base-entity-without-id';


export interface InvoiceUserDefaults {
  street: string,
  postalCode: string,
  city: string,
  country: string,
  addressee: string,
}

@Entity()
export default class InvoiceUser extends BaseEntityWithoutId {
  @PrimaryColumn()
  // id of the linked user.
  public userId: number;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  // Linked user entity.
  public user: User;

  @Column({
    default: false,
  })
  // Whether invoices should be automagically generated if possible.
  public automatic: boolean;

  @Column()
  // Default street to use on invoices.
  public street: string;

  @Column()
  // Default postal code to use on invoices.
  public postalCode: string;

  @Column()
  // Default city to use on invoices.
  public city: string;

  @Column()
  // Default country to use on invoices.
  public country: string;
}
