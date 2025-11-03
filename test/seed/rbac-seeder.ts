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

import Role from '../../src/entity/rbac/role';
import Permission from '../../src/entity/rbac/permission';
import User, { UserType } from '../../src/entity/user/user';
import { DeepPartial } from 'typeorm';
import AssignedRole from '../../src/entity/rbac/assigned-role';
import { RoleDefinition } from '../../src/rbac/role-definitions';
import JsonWebToken from '../../src/authentication/json-web-token';
import RBACService from '../../src/service/rbac-service';
import RoleUserType from '../../src/entity/rbac/role-user-type';
import WithManager from '../../src/database/with-manager';

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

export default class RbacSeeder extends WithManager {
  public async seed(roles: SeedRoleDefinition[], users?: User[]): Promise<SeededRole[]> {
    const seededRoles = await Promise.all(roles.map((role) => this.manager.save(Role, { name: role.name, systemDefault: role.systemDefault })
      .then(async (r): Promise<SeededRole> => {
        if (role.userTypes && role.userTypes.length > 0) {
          r.roleUserTypes = await this.manager.save(RoleUserType, role.userTypes.map((userType): DeepPartial<RoleUserType> => ({
            role: r,
            roleId: r.id,
            userType,
          })));
        } else {
          r.roleUserTypes = [];
        }
        const permissions = RBACService.definitionToRules(role.permissions)
          .map((p): DeepPartial<Permission> => ({
            role: r,
            roleId: r.id,
            ...p,
          }));
        r.permissions = await this.manager.save(Permission, permissions);
        return {
          role: await this.manager.findOne(Role, { where: { id: r.id }, relations: { roleUserTypes: true, permissions: true } }),
          assignmentCheck: role.assignmentCheck,
        };
      })));

    if (users && users.length > 0) {
      for (let i = 0; i < users.length; i += 1) {
        const rolesToAssign = seededRoles.filter(() => i % 2);

        await this.assignRoles(users[i], rolesToAssign);
      }
    }

    return seededRoles;
  }

  public async assignRole(user: User, { role, assignmentCheck }: SeededRole): Promise<AssignedRole | undefined> {
    if (!assignmentCheck || !await assignmentCheck(user)) {
      return undefined;
    }

    return await this.manager.save(AssignedRole, { roleId: role.id, role, userId: user.id }) as AssignedRole;
  }

  public async assignRoles(user: User, roles: SeededRole[]): Promise<AssignedRole[]> {
    const assignments = await Promise.all(roles.map((r) => this.assignRole(user, r)));
    return assignments.filter((a) => a !== undefined);
  }

  public async getToken(user: User, roles: SeededRole[] = [], organs?: User[], posId?: number): Promise<JsonWebToken> {
    const assignments = await this.assignRoles(user, roles);
    const systemDefaultRoles = await this.manager.find(Role, { where: { systemDefault: true } });
    const assignedSystemRoles = systemDefaultRoles.filter((r) => r.roleUserTypes.some((u) => u.userType === user.type));
    return {
      user,
      roles: assignments.map((a) => a.role.name)
        .concat(assignedSystemRoles.map((a) => a.name)),
      organs,
      posId,
    };
  }
}
