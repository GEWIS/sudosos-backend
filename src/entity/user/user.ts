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
  Column, Entity, JoinColumn, OneToMany, OneToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import UserFineGroup from '../fine/userFineGroup';
import AssignedRole from '../rbac/assigned-role';
import Permission from '../rbac/permission';
import Role from '../rbac/role';

export enum TermsOfServiceStatus {
  ACCEPTED = 'ACCEPTED',
  NOT_ACCEPTED = 'NOT_ACCEPTED',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum UserType {
  MEMBER = 1,
  ORGAN = 2,
  VOUCHER = 3,
  LOCAL_USER = 4,
  LOCAL_ADMIN = 5,
  INVOICE = 6,
}

/**
 * All user types that should be allowed to have a local password.
 */
export const LocalUserTypes = [
  UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.INVOICE,
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
 * @typedef {BaseEntity} User
 * @property {string} firstName.required - First name of the user.
 * @property {string} lastName - Last name of the user.
 * @property {string} nickname - Nickname of the user.
 * @property {boolean} active - Whether the user has accepted the TOS. Defaults to false.
 * @property {boolean} canGoIntoDebt - Whether the user can have a negative balance. Defaults to false
 * @property {boolean} ofAge - Whether the user is 18+ or not.
 * @property {string} email - The email of the user.
 * @property {boolean} deleted - Whether the user was deleted. Defaults to false.
 * @property {string} type.required - The type of user.
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

  @OneToMany(() => AssignedRole, (role) => role.user)
  public directAssignedRoles: AssignedRole[];

  /**
   * Get all roles that are explicitly assigned to this user
   * @param getPermissions
   */
  public async getAssignedRoles(getPermissions = false): Promise<Role[]> {
    return Role.find({
      where: { assignments: { userId: this.id } },
      relations: { permissions: getPermissions },
    });
  }

  /**
   * Get all roles that are default for this user type
   * @param getPermissions
   */
  public async getTypeRoles(getPermissions = false): Promise<Role[]> {
    return Role.find({
      where: { roleUserTypes: { userType: this.type } },
      relations: { permissions: getPermissions },
    });
  }

  /**
   * Get a list of all roles this user has, optionally with the permissions of each role
   * @param getPermissions
   */
  public async getRoles(getPermissions = false): Promise<Role[]> {
    return (await Promise.all([
      await this.getTypeRoles(getPermissions),
      await this.getAssignedRoles(getPermissions),
    ])).flat();
  }

  /**
   * Get a list of all permissions this user has
   */
  public async getPermissions(): Promise<Permission[]> {
    const roles = await this.getRoles(true);
    return roles.map((r) => r.permissions)
      .flat()
      .filter((p1, index, all) => index === all.findIndex((p2) => p1.identifier === p2.identifier));
  }


  public fullName(): string {
    let name = this.firstName;
    if (this.nickname) name += ` "${this.nickname}"`;
    if (this.lastName) name += ` ${this.lastName}`;
    return name;
  }

  public toString(): string {
    return `${this.fullName()} (SudoSOS ID: ${this.id})`;
  }
}
