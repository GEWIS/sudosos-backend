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

import { BaseEntity, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import Role from './role';
import { UserType } from '../user/user';

/**
 * Many-to-many relationship between user types and roles
 */
@Entity()
export default class RoleUserType extends BaseEntity {
  @PrimaryColumn()
  public roleId: number;

  @ManyToOne(() => Role, (r) => r.roleUserTypes, { cascade: true })
  @JoinColumn({ name: 'roleId' })
  public role: Role;

  @PrimaryColumn()
  public userType: UserType;
}