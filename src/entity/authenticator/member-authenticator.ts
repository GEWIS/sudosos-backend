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
  Entity, Index, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import User from '../user/user';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {AuthenticationMethod} MemberAuthenticator
 * @property {User.model} authenticateAs.required - The user entity this user wants to
 * authenticate as.
 */
@Entity()
export default class MemberAuthenticator extends BaseEntityWithoutId {
  @PrimaryColumn({ unique:false })
  public authenticateAsId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'authenticateAsId' })
  public authenticateAs: User;

  @PrimaryColumn({ unique:false })
  @Index({ unique: false })
  public userId: number;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'userId' })
  public user: User;
}
