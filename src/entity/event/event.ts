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
  Column, Entity, ManyToOne, JoinColumn,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';

/**
 * @typedef {BaseEntity} Event
 * @property {string} name - Name of the event.
 * @property {User.model} createdBy - Creator of the event.
 * @property {string} startDate - The starting date from which the banner should be shown.
 * @property {string} endDate - The end date from which the banner should no longer be shown.
 */

@Entity()
export default class Event extends BaseEntity {
  @Column()
  public name: string;

  @JoinColumn()
  @ManyToOne(() => User, { nullable: false, eager: true })
  public createdBy: User;

  @Column({
    type: 'datetime',
  })
  public startDate: Date;

  @Column({
    type: 'datetime',
  })
  public endDate: Date;
}
