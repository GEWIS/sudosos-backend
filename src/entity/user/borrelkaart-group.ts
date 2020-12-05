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
  Column, Entity, JoinColumn, OneToMany,
} from 'typeorm';
import BaseEntity from '../base-entity';
// eslint-disable-next-line import/no-cycle
import User from './user';

/**
 * @typedef {BorrelkaartGroup} BorrelkaartGroup
 * @property {string} name.required - Name of the group
 * @property {Date} activeStartDate.required - Date from which the included cards are active
 * @property {Date} activeEndDate - Date from which cards are no longer active
 * @property {Array.<User>} borrelkaarten.required - Cards included in this group
 */
@Entity()
export default class BorrelkaartGroup extends BaseEntity {
  @Column({
    unique: true,
    length: 64,
  })
  public name: string;

  public activeStartDate: Date;

  public activeEndDate?: Date;

  @OneToMany(() => User, (user) => user.borrelkaartGroup)
  @JoinColumn({ name: 'borrelkaarten' })
  public borrelkaarten: User[];
}
