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

import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import { Dinero } from 'dinero.js';
import DineroTransformer from '../transformer/dinero-transformer';
import Transfer from './transfer';


@Entity()
export default class InactivityAdministrativeCosts extends BaseEntity {
  @Column({ nullable: false })
  public fromId: number;

  @ManyToOne(() => User, { nullable: false })
  public from: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @Column()
  public lastTransaction: Date;

  @Column()
  public lastTransactionId: number | undefined;

  @Column()
  public lastTransferId: number | undefined;

  @OneToOne(() => Transfer, { nullable: true })
  @JoinColumn()
  public transfer: Transfer;
}

