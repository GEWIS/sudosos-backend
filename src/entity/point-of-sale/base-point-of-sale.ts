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
  Column,
} from 'typeorm';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {BaseEntityWithoutId} BasePointOfSale
 * @property {string} name.required - The unique name of the pointOfSale.
 * @property {string} startDate.required -
 * The date after which the pointOfSale should become available.
 * @property {string} endDate - The date after which the pointOfSale should become unavailable.
 * @property {boolean} useAuthentication -
 * Whether the pointOfSale can be logged into by normal members. Defaults to false.
 */
export default class BasePointOfSale extends BaseEntityWithoutId {
  @Column({
    length: 64,
  })
  public name: string;

  @Column()
  public startDate: Date;

  @Column({
    nullable: true,
  })
  public endDate: Date;

  @Column()
  public useAuthentication: boolean = false;
}
