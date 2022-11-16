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
  Column, Entity, JoinColumn, ManyToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import BorrelSchema from './borrel-schema';
import BorrelSchemaShift from './borrel-schema-shift';

export enum Availability {
  YES = 1,
  MAYBE = 2,
  LATER = 3,
  NO = 4,
  NAN = 5,
}

/**
 * @typedef {BaseEntity} Answers
 * @property {User.model} user - Participant that filled in their availability
 * @property {enum} availability - Filled in availability per slot.
 * @property {boolean} selected - Indicator whether the person has the related shift
 * during the related borrel.
 * @property {BorrelSchemaShift.model} shift - Shift that answers are related to.
 * @property {BorrelSchema.model} borrelSchema - Borrelschema that answers are related to
 */

@Entity()
export default class BorrelSchemaAnswer extends BaseEntity {
  @ManyToOne(() => User, { nullable: false, eager: true })
  public user: User;

  @Column({ nullable: true })
  public availability: Availability;

  @Column()
  public selected: boolean;

  @JoinColumn()
  @ManyToOne(() => BorrelSchemaShift, { onDelete: 'RESTRICT' })
  public shift: BorrelSchemaShift;

  @JoinColumn()
  @ManyToOne(() => BorrelSchema, { onDelete: 'CASCADE' })
  public borrelSchema: BorrelSchema;
}
