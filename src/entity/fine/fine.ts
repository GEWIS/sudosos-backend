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
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, Tree, TreeParent } from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import Transfer from '../transactions/transfer';
import DineroTransformer from '../transformer/dinero-transformer';
import { Dinero } from 'dinero.js';
import FineHandoutEvent from './fineHandoutEvent';
import UserFineGroup from './userFineGroup';

@Entity()
@Tree('materialized-path')
export default class Fine extends BaseEntity {
  @ManyToOne(() => FineHandoutEvent, { nullable: false })
  @JoinColumn()
  public fineGroup: FineHandoutEvent;

  @ManyToOne(() => UserFineGroup, { nullable: false })
  @JoinColumn()
  public userFineCollection: UserFineGroup;

  @OneToOne(() => Transfer, { nullable: true })
  @JoinColumn()
  public transfer: Transfer | null;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @TreeParent()
  public previousFine: Fine | null;

  /**
   * The number of the fine that this user has received (in sequence)
   * So, if the user has received a fine because he was in debt and
   * is going to receive another fine, this index will be "2". If he pays
   * off his debts, any new fines will start with "1" again.
   *
   * Could be removed because of FineGroups, but caching this value makes
   * calculating new fines much, much easier
   */
  // @Column({ type: 'integer' })
  // public fineIndex: number;
}
