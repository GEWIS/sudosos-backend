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
 * This is the module page of the base-payout.
 *
 * @module payouts
 */

import BaseEntity from '../../base-entity';
import { Column, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import User from '../../user/user';
import Transfer from '../transfer';
import DineroTransformer from '../../transformer/dinero-transformer';
import { Dinero } from 'dinero.js';

export default class BasePayout extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn()
  public requestedBy: User;

  @OneToOne(() => Transfer, { nullable: true })
  @JoinColumn()
  public transfer?: Transfer;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  async getOwner(): Promise<User> {
    return this.requestedBy;
  }
}
