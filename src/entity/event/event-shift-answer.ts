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

import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import User from '../user/user';
import Event from './event';
import EventShift from './event-shift';
import BaseEntityWithoutId from '../base-entity-without-id';

export enum Availability {
  YES = 'YES',
  MAYBE = 'MAYBE',
  LATER = 'LATER',
  NO = 'NO',
  NA = 'NA',
}

/**
 * @typedef {BaseEntity} EventShiftAnswer
 * @property {User.model} user - Participant that filled in their availability
 * @property {enum} availability - Filled in availability per slot.
 * @property {boolean} selected - Indicator whether the person has the related shift
 * during the related borrel.
 * @property {EventShift.model} shift - Shift that answers are related to.
 * @property {Event.model} event - Event that answers are related to
 */

@Entity()
export default class EventShiftAnswer extends BaseEntityWithoutId {
  @PrimaryColumn({ nullable: false })
  public userId: number;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({ nullable: true })
  public availability: Availability | null;

  @Column({ default: false })
  public selected: boolean;

  @PrimaryColumn({ nullable: false })
  public shiftId: number;

  @ManyToOne(() => EventShift, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shiftId' })
  public shift: EventShift;

  @PrimaryColumn({ nullable: false })
  public eventId: number;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  public event: Event;
}
