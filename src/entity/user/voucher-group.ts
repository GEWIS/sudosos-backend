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

import { Dinero } from 'dinero.js';
import {
  Column, Entity, OneToMany,
} from 'typeorm';
import BaseEntity from '../base-entity';
import DineroTransformer from '../transformer/dinero-transformer';
// eslint-disable-next-line import/no-cycle
import UserVoucherGroup from './user-voucher-group';

/**
 * @typedef {BaseEntity} VoucherGroup
 * @property {string} name.required - Name of the group.
 * @property {string} activeStartDate.required - Date after which the included cards are active.
 * @property {string} activeEndDate - Date after which cards are no longer active.
 * @property {Array.<User>} vouchers.required - Cards included in this group.
 */
@Entity()
export default class VoucherGroup extends BaseEntity {
  @Column({
    unique: true,
    length: 64,
  })
  public name: string;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  public activeStartDate: Date;

  @Column({
    type: 'datetime',
  })
  public activeEndDate: Date;

  @Column({
    type: 'integer',
  })
  public amount: number;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public balance: Dinero;

  @OneToMany(() => UserVoucherGroup, (user) => user.voucherGroup)
  public vouchers: UserVoucherGroup[];
}
