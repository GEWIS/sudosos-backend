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
  Column, Entity,
} from 'typeorm';
import BaseEntity from '../base-entity';

export enum UserType {
  MEMBER = 1,
  ORGAN = 2,
  BORRELKAART = 3,
  LOCAL_USER = 4,
  LOCAL_ADMIN = 5,
}

/**
 * @typedef {BaseEntityWithoutId} User
 * @property {string} firstName.required - First name of the user
 * @property {string} lastName - Last name of the user
 * @property {boolean} active.required - Whether the user has accepted the TOS
 * @property {UserType} type.required - The type of user
 * @property {BorrelkaartGroup.model} borrelkaartGroup - Reference to the borrelkaart group,
 *     if this user is of type borrelkaart
 */
@Entity()
export default class User extends BaseEntity {
  @Column({
    length: 64,
  })
  public firstName: string;

  @Column({
    length: 64,
    default: '',
  })
  public lastName?: string;

  @Column({
    default: false,
  })
  public active?: boolean;

  @Column({
    default: false,
  })
  public deleted?: boolean;

  @Column({
    nullable: false,
  })
  public type: UserType;
}
