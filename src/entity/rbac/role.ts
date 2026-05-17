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
 * A `Role` is a named permission set. A user picks up a role through one of three paths:
 * their user type maps to it via {@link RoleUserType}, an admin assigns it explicitly via
 * {@link AssignedRole}, or they inherit it from an organ they belong to via
 * {@link organ!OrganMembership | OrganMembership}. `RoleManager` resolves the union of all
 * three on every request.
 *
 * ### The permission tuple
 * A {@link Permission} row is keyed on `(role, entity, action, relation)` with a JSON
 * `attributes` list. To read a user's own email the check is
 * `can(roles, "get", "own", "User", ["email"])`. The user passes if at least one of their
 * roles has a permission row matching that tuple whose attributes contain `"email"` or the
 * wildcard `"*"`.
 *
 * Relations express ownership scope. The common ones are `"own"` (the user themselves),
 * `"organ"` (anyone in an organ the user belongs to), `"created"` (records the user
 * created), and `"all"` (the global escape hatch). `RoleManager.can()` always adds `"all"`
 * to the requested relations before querying, so a permission with relation `"all"` covers
 * any narrower one.
 *
 * ### Production roles
 * Production has a fixed set of system roles, defined in `src/rbac/default-roles.ts` and
 * idempotently seeded by `DefaultRoles.synchronize()`:
 * - `User` -- base read role attached to most authenticated users.
 * - `Local User` -- additional permissions for users with a local password.
 * - `Buyer` -- can create transactions.
 * - `AuthorizedBuyer` -- can create transactions on behalf of others.
 * - `Invoice` -- attached to invoice-type accounts.
 * - `Point of Sale` -- attached to POS-type accounts.
 * - `Seller` -- granted to container owners through organ membership.
 * - `Super admin` -- wildcard everything for system administrators.
 *
 * The `UserType` -> role mapping is seeded into `RoleUserType` rows by the same code path.
 * `Role.systemDefault: true` marks these as protected: the cleanup pass at the end of
 * `synchronize()` only deletes systemDefault roles whose name is missing from
 * `default-roles.ts`, so admin-created roles are never touched.
 *
 * ### Dev-mode bypass
 * `RoleManager.can()` returns `true` unconditionally when `Config.app.isDevelopment` is set.
 * Tests that exercise RBAC need a non-`development` `NODE_ENV`, or the fixtures that seed
 * the production roles and sign real tokens (`ensureProductionRoles()` + `signTokenFor()`).
 *
 * ### Controller
 * {@link RbacController} exposes role CRUD plus per-role permission editing: list roles, get
 * a role with its permissions, list users linked to a role, create / update / delete roles,
 * and add / remove permissions on a role. It does not assign roles to users -- that happens
 * through {@link AssignedRole} writes, or more commonly falls out of the
 * `UserType` -> `RoleUserType` mapping.
 *
 * @module rbac
 * @mergeTarget
 */

import BaseEntity from '../base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import Permission from './permission';
import AssignedRole from './assigned-role';
import RoleUserType from './role-user-type';
import { UserType } from '../user/user';

@Entity()
export default class Role extends BaseEntity {
  @Column({ unique: true })
  public name: string;

  @OneToMany(() => AssignedRole, (assignedRole) => assignedRole.role)
  public assignments: AssignedRole[];

  @OneToMany(() => Permission, (permission) => permission.role)
  public permissions: Permission[];

  @Column({ default: false })
  public systemDefault: boolean;

  @OneToMany(() => RoleUserType, (r) => r.role, { eager: true })
  public roleUserTypes: RoleUserType[];

  public get userTypes(): UserType[] {
    return this.roleUserTypes.map((r) => r.userType);
  }
}
