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
  Column, Entity, JoinColumn, OneToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import UserFineGroup from '../fine/userFineGroup';

export enum TermsOfServiceStatus {
  ACCEPTED = 'ACCEPTED',
  NOT_ACCEPTED = 'NOT_ACCEPTED',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum UserType {
  MEMBER = 1,
  ORGAN = 2,
  BORRELKAART = 3,
  LOCAL_USER = 4,
  LOCAL_ADMIN = 5,
  INVOICE = 6,
  AUTOMATIC_INVOICE = 7,
}

/**
 * All user types that should be allowed to have a local password.
 */
export const LocalUserTypes = [
  UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.INVOICE, UserType.AUTOMATIC_INVOICE,
];

/**
 * All users that have required TOS restrictions.
 */
export const TOSRequired = [
  UserType.MEMBER, UserType.LOCAL_USER, UserType.LOCAL_ADMIN,
];

/**
 * @typedef {BaseEntity} User
 * @property {string} firstName.required - First name of the user.
 * @property {string} lastName - Last name of the user.
 * @property {boolean} active - Whether the user has accepted the TOS. Defaults to false.
 * @property {boolean} ofAge - Whether the user is 18+ or not.
 * @property {string} email - The email of the user.
 * @property {boolean} deleted - Whether the user was deleted. Defaults to false.
 * @property {enum} type.required - The type of user.
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
  public lastName: string;

  @Column({
    default: false,
  })
  public active: boolean;

  @Column({
    default: false,
  })
  public ofAge: boolean;

  @Column({
    length: 64,
    default: '',
  })
  public email: string;

  @Column({
    default: false,
  })
  public deleted: boolean;

  @Column({
    nullable: false,
  })
  public type: UserType;

  @Column({
    nullable: false, default: TermsOfServiceStatus.NOT_ACCEPTED,
  })
  public acceptedToS: TermsOfServiceStatus;

  @Column({
    default: false,
  })
  public extensiveDataProcessing: boolean;

  @OneToOne(() => UserFineGroup, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  public currentFines?: UserFineGroup | null;
}
