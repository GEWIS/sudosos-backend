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
  Column, Entity, JoinColumn, ManyToOne,
} from 'typeorm';
import BaseEntity from './base-entity';
// eslint-disable-next-line import/no-cycle
import BorrelkaartGroup from './borrelkaart-group';

export enum UserType {
  MEMBER = 'member',
  ORGAN = 'organ',
  BORRELKAART = 'borrelkaart',
  LOCAL_USER = 'localUser',
  LOCAL_ADMIN = 'localAdmin',
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
  })
  public lastName?: string;

  @Column({
    default: false,
  })
  public active: boolean;

  @Column({
    default: true,
  })
  public deleted: boolean;

  /* This snippet does unfortunately not work, because SQLite
     does not support the "enum" column type. For now, use the workaround below.
  @Column({
    type: 'enum',
    enum: UserType,
  })
  public type: UserType; */
  @Column()
  public type: 'member' | 'organ' | 'borrelkaart' | 'localUser' | 'localAdmin';

  // If the user is a borrelkaart, we need to save its group
  @ManyToOne(() => BorrelkaartGroup)
  @JoinColumn({ name: 'borrelkaartGroup' })
  public borrelkaartGroup?: BorrelkaartGroup;
}
