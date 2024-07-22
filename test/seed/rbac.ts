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
import Role from '../../src/entity/rbac/role';
import Permission from '../../src/entity/rbac/permission';
import User, { UserType } from '../../src/entity/user/user';
import { DeepPartial } from 'typeorm';
import AssignedRole from '../../src/entity/rbac/assigned-role';
import { RoleDefinition } from '../../src/rbac/role-manager';
import JsonWebToken from '../../src/authentication/json-web-token';
import RBACService from '../../src/service/rbac-service';
import RoleUserType from '../../src/entity/rbac/role-user-type';

interface SeedRoleDefinition extends RoleDefinition {
  /**
   * The user types of this role
   */
  userTypes?: UserType[];
  /**
   * Whether this role is a system default
   */
  systemDefault?: boolean;
}

export interface SeededRole {
  role: Role,
  assignmentCheck?: (user: User) => boolean | Promise<boolean>;
}

export async function seedRoles(roles: SeedRoleDefinition[]): Promise<SeededRole[]> {
  return Promise.all(roles.map((role) => Role.save({ name: role.name, systemDefault: role.systemDefault })
    .then(async (r): Promise<SeededRole> => {
      if (role.userTypes && role.userTypes.length > 0) {
        r.roleUserTypes = await RoleUserType.save(role.userTypes.map((userType): DeepPartial<RoleUserType> => ({ role: r, roleId: r.id, userType })));
      } else {
        r.roleUserTypes = [];
      }
      const permissions = RBACService.definitionToRules(role.permissions)
        .map((p): DeepPartial<Permission> => ({
          role: r,
          roleId: r.id,
          ...p,
        }));
      r.permissions = await Permission.save(permissions);
      return {
        role: await Role.findOne({ where: { id: r.id }, relations: { roleUserTypes: true, permissions: true } }),
        assignmentCheck: role.assignmentCheck,
      };
    })));
}

export async function assignRole(user: User, { role, assignmentCheck }: SeededRole): Promise<AssignedRole | undefined> {
  if (!assignmentCheck || !await assignmentCheck(user)) {
    return undefined;
  }

  return await AssignedRole.save({ roleId: role.id, role, userId: user.id }) as AssignedRole;
}

export async function assignRoles(user: User, roles: SeededRole[]): Promise<AssignedRole[]> {
  const assignments = await Promise.all(roles.map((r) => assignRole(user, r)));
  return assignments.filter((a) => a !== undefined);
}

export async function getToken(user: User, roles: SeededRole[] = [], organs?: User[], lesser = false): Promise<JsonWebToken> {
  const assignments = await assignRoles(user, roles);
  const systemDefaultRoles = await Role.find({ where: { systemDefault: true } });
  const assignedSystemRoles = systemDefaultRoles.filter((r) => r.roleUserTypes.some((u) => u.userType === user.type));
  return {
    user,
    roles: assignments.map((a) => a.role.name)
      .concat(assignedSystemRoles.map((a) => a.name)),
    organs,
    lesser,
  };
}
