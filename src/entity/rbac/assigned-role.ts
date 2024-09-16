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
  Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import BaseEntityWithoutId from '../base-entity-without-id';
import User from '../user/user';
import Role from './role';

/**
 * Basically the many-to-many relationship between users and roles, but still exists
 * for testing and legacy.
 *
 * @typedef {BaseEntityWithoutId} AssignedRole
 * @property {User.model} user.required - The user being assigned a role
 * @property {string} role.required - The name of the role
 */
@Entity()
export default class AssignedRole extends BaseEntityWithoutId {
  @PrimaryColumn()
  public userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @PrimaryColumn()
  public roleId: number;

  @ManyToOne(() => Role, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'roleId' })
  public role: Role;
}
