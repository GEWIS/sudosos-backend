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

import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import User from '../user/user';
import Fine from './fine';
import BaseEntity from '../base-entity';
import Transfer from '../transactions/transfer';

@Entity()
export default class UserFineGroup extends BaseEntity {
  @Column({ type: 'integer' })
  public readonly userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @OneToMany(() => Fine, (fine) => fine.userFineGroup)
  public fines: Fine[];

  @OneToOne(() => Transfer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  public waivedTransfer?: Transfer | null;
}
