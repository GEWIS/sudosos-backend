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
  Column, Entity, ManyToOne, JoinColumn, OneToMany, ManyToMany, JoinTable,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import EventShiftAnswer from './event-shift-answer';
import EventShift from './event-shift';

export enum EventType {
  BORREL = 'BORREL', // Weekly GEWIS borrel, both normal borrels and extended borrels
  EXTERNAL_BORREL = 'EXTERNAL_BORREL', // Borrel with/for external party
  OTHER = 'OTHER', // All other activities
}

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
    precision: 6,
  })
  public startDate: Date;

  @Column({
    type: 'datetime',
    precision: 6,
  })
  public endDate: Date;

  @Column({
    nullable: false,
  })
  public type: EventType;

  @ManyToMany(() => EventShift)
  @JoinTable()
  public shifts: EventShift[];

  @OneToMany(() => EventShiftAnswer, (a) => a.event)
  public answers: EventShiftAnswer[];
}
