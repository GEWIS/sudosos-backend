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
  Column, Entity, ManyToMany,
} from 'typeorm';
import BaseEntity from '../base-entity';
import AssignedRole from '../roles/assigned-role';

/**
 * @typedef {BaseEntity} EventShift
 * @property {string} name - Name of the shift.
 * @property {boolean} default - Indicator whether the shift is a regular shift.
 */

@Entity()
export default class EventShift extends BaseEntity {
  @Column()
  public name: string;

  @Column()
  public default: boolean;

  @Column({
    type: 'varchar',
    transformer: {
      to: (val: string[]) => JSON.stringify(val),
      from: (val: string) => JSON.parse(val),
    },
  })
  public roles: string[];
}
