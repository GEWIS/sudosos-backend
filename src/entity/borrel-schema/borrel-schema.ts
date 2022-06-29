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
  Column, Entity, ManyToOne, ManyToMany, JoinColumn, JoinTable,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
// eslint-disable-next-line import/no-cycle
import BorrelSchemaShift from './borrel-schema-shift';

/**
 * @typedef {BaseEntity} BorrelSchema
 * @property {string} name - Name of the borrel.
 * @property {User.model} createdBy - Creator of the borrelschema.
 * @property {string} startDate - The starting date from which the banner should be shown.
 * @property {string} endDate - The end date from which the banner should no longer be shown.
 * @property {Array<BorrelSchemaShift.model>} shifts - Filled in availability
 * per participant per borrel.
 */

@Entity()
export default class BorrelSchema extends BaseEntity {
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

  @JoinTable()
  @ManyToMany(() => BorrelSchemaShift)
  public shifts: BorrelSchemaShift[];
}
