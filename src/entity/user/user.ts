/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

/**
 * This is the module page of the user.
 *
 * @module users
 * @mergeTarget
 */

import {
  Column, Entity, JoinColumn, OneToMany, OneToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import UserFineGroup from '../fine/userFineGroup';
import AssignedRole from '../rbac/assigned-role';
import PointOfSale from '../point-of-sale/point-of-sale';
import MemberUser from './member-user';

export enum TermsOfServiceStatus {
  ACCEPTED = 'ACCEPTED',
  NOT_ACCEPTED = 'NOT_ACCEPTED',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum UserType {
  MEMBER = 'MEMBER',
  ORGAN = 'ORGAN',
  VOUCHER = 'VOUCHER',
  LOCAL_USER = 'LOCAL_USER',
  LOCAL_ADMIN = 'LOCAL_ADMIN',
  INVOICE = 'INVOICE',
  POINT_OF_SALE = 'POINT_OF_SALE',
  INTEGRATION = 'INTEGRATION',
}

/**
 * All user types that should be allowed to have a local password.
 */
export const LocalUserTypes = [
  UserType.LOCAL_USER, UserType.LOCAL_ADMIN,
];

/**
 * All users that have required TOS restrictions.
 */
export const TOSRequired = [
  UserType.MEMBER, UserType.LOCAL_USER, UserType.LOCAL_ADMIN,
];

/**
 * All users that should be notified when in debt.
 */
export const NotifyDebtUserTypes: UserType[] = [
  UserType.LOCAL_ADMIN, UserType.LOCAL_USER, UserType.MEMBER,
];

/**
 * All users that have made inactive administrative costs.
 */
export const EligibleInactiveUsers: UserType[] = [
  UserType.LOCAL_USER, UserType.MEMBER,
];

/**
 * Represents a user account in the SudoSOS system.
 *
 * ### `active`
 * A user is considered **inactive** (`active: false`) when they are restricted to
 * only logging in and topping up their balance. This typically applies to e.g.
 * alumni who have graduated but still have an outstanding debt and need to be able
 * to settle it. Inactive users cannot make purchases.
 *
 * ### `deleted`
 * A user is **soft-deleted** (`deleted: true`) when their account has been removed
 * from the system but their balance is exactly €0.00 at the time of deletion.
 * Soft-deletion preserves the database record (and any associated transaction
 * history) while preventing the account from being used. A user can only be
 * soft-deleted once their balance is exactly zero; if a balance remains, the
 * account should first be set to inactive until the balance is settled.
 *
 * @example
 * // Inactive user — still owes money, can only top up:
 * user.active = false;
 * user.deleted = false;
 *
 * @example
 * // Soft-deleted user — balance settled, account archived:
 * user.active = false;
 * user.deleted = true; // only valid when balance === 0
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
    length: 64,
    nullable: true,
  })
  public nickname: string;

  /**
   * Whether this user is active.
   *
   * An **inactive** user (`active: false`) can only log in and top up their balance.
   * They cannot make purchases. This is used for e.g. alumni who have graduated but
   * still have an outstanding debt that they need to settle.
   *
   * @default false
   */
  @Column({
    default: false,
  })
  public active: boolean;

  /**
   * Whether this user can have a negative balance
   */
  @Column({
    default: false,
  })
  public canGoIntoDebt: boolean;

  @Column({
    default: false,
  })
  public ofAge: boolean;

  @Column({
    length: 64,
    default: '',
  })
  public email: string;

  /**
   * Whether this user has been soft-deleted.
   *
   * A **soft-deleted** user (`deleted: true`) has been removed from the system
   * but their database record is preserved to maintain transaction history integrity.
   * A user may only be soft-deleted once their balance is exactly €0.00. If a balance
   * remains, the account should first be set to inactive (`active: false`) and left
   * until the balance is settled before deletion.
   *
   * @default false
   */
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

  @Column({
    default: false,
  })
  public inactiveNotificationSend: boolean;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  public lastSeen: Date | null;

  @OneToOne(() => UserFineGroup, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  public currentFines?: UserFineGroup | null;

  @OneToMany(() => AssignedRole, (role) => role.user)
  public directAssignedRoles: AssignedRole[];

  @OneToOne(() => PointOfSale, (pos) => pos.user)
  public pointOfSale?: PointOfSale;

  @OneToOne(() => MemberUser, (memberUser) => memberUser.user)
  public memberUser?: MemberUser;

  public fullName(): string {
    return User.fullName(this);
  }

  /**
   * Get the full name of the given user.
   * Separate static method, as user objects taken from tokens
   * do not have any class methods.
   * @param user
   */
  public static fullName(user: User): string {
    let name = user.firstName;
    if (user.nickname) name += ` "${user.nickname}"`;
    if (user.lastName) name += ` ${user.lastName}`;
    return name;
  }

  public toString(): string {
    return `${this.fullName()} (SudoSOS ID: ${this.id})`;
  }
}
