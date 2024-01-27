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
  Column, Entity, JoinColumn, OneToOne, PrimaryColumn,
} from 'typeorm';

import User from './user';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {BaseEntity} InvoiceUser
 * @property {User.model} user.required - The user that is an invoice account
 * @property {boolean} automatic - Whether the user gets automatic invoices
 */
@Entity()
export default class InvoiceUser extends BaseEntityWithoutId {
  @PrimaryColumn()
  public userId: number;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({
    default: false,
  })
  public automatic: boolean;

  @Column()
  public street: string;

  @Column()
  public postalCode:string;

  @Column()
  public city: string;

  @Column()
  public country: string;
}
