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
 */


import {
  BaseEntity, Column, Entity, JoinColumn, OneToOne, PrimaryColumn,
} from 'typeorm';
import User from '../../entity/user/user';

/**
 * @typedef {BaseEntity} GewisUser
 * @property {User.model} user.required - The user.
 * @property {integer} gewisId.required - The id of the member.
 */
@Entity()
export default class GewisUser extends BaseEntity {
  @PrimaryColumn()
  public userId: number;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({
    type: 'integer',
  })
  public gewisId: number;
}
