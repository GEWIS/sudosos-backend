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
import { Column, Entity } from 'typeorm';
import BaseEntity from './base-entity';

/**
 * @typedef {Banner} Banner
 * @property {string} name - Name/label of the banner
 * @property {string} picture - Location of the image
 * @property {integer} duration - How long the banner should be shown (in seconds)
 * @property {active} boolean - Whether the banner is active. Overrides start and end date
 * @property {Date} startDate - The starting date from which the banner should be shown
 * @property {Date} endDate - The end date from which the banner should no longer be shown
 */
@Entity()
export default class Banner extends BaseEntity {
  @Column()
  public name: string;

  @Column()
  public picture: string;

  @Column({
    type: 'integer',
  })
  public duration: number;

  @Column({
    default: false,
  })
  public active: boolean;

  @Column({
    type: 'datetime',
    default: 'CURRENT_TIMESTAMP',
  })
  public startDate?: Date;

  @Column({
    type: 'datetime',
  })
  public endDate: Date;
}
