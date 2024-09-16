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

import { Column, Entity, ManyToOne } from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';

/**
 * @typedef {BaseEntity} BaseFile
 * @property {string} downloadName.required - The filename when the file is downloaded
 * @property {string} location.required - The location of the file, including filename in storage
 * @property {User.model} createdBy.required - The user that created this file
 */
@Entity()
export default class BaseFile extends BaseEntity {
  @Column()
  public downloadName: string;

  @Column()
  public location: string;

  @ManyToOne(() => User, { nullable: false })
  public createdBy: User;
}
