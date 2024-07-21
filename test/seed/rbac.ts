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

export interface RolesPermissionsSeedResult {
  roles: SeededRole[],
  assignments: AssignedRole[],
}

const star = ['*'];

function getAdminPermissions(role: Role, entity: string, relationOwn = true): DeepPartial<Permission>[] {
  const result = [
    { roleId: role.id, role, entity, action: 'get', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'update', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'create', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'delete', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'approve', relation: 'all', attributes: star },
  ];
  if (!relationOwn) return result;
  return [
    ...result,
    { roleId: role.id, role, entity, action: 'get', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'update', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'create', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'delete', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'approve', relation: 'own', attributes: star },
  ];
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
  // if (user.roles) {
  //   user.roles.push(assignment);
  // } else {
  //   user.roles = [assignment];
  // }
  return await AssignedRole.save({ roleId: role.id, role, userId: user.id }) as AssignedRole;
}

export async function assignRoles(user: User, roles: SeededRole[]): Promise<AssignedRole[]> {
  const assignments = await Promise.all(roles.map((r) => assignRole(user, r)));
  return assignments.filter((a) => a !== undefined);
}

export async function getToken(user: User, roles: SeededRole[], organs?: User[], lesser = false): Promise<JsonWebToken> {
  const assignments = await assignRoles(user, roles);
  return {
    user,
    roles: assignments.map((a) => a.role.name),
    organs,
    lesser,
  };
}

export async function seedProductionRolesWithPermissions(users: User[]) {

  const nonHumanUserTypes = new Set([]);
  const userRole = await Role.save({ name: 'User' } as DeepPartial<Role>).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Balance', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Authenticator', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Transfer', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Transaction', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'VatGroup', action: 'get', relation: 'own', attributes: star },
    ]);
    return {
      role,
      assignmentCheck: (user: User) => !nonHumanUserTypes.has(user.type),
    };
  });

  const localUserRole = await Role.save({ name: 'Local User' } as DeepPartial<Role>).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Authenticator', action: 'update', relation: 'own', attributes: ['password'] },
      { roleId: role.id, role, entity: 'Authenticator', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'update', relation: 'own', attributes: ['email'] },
    ]);
    return {
      role,
      assignmentCheck: (user: User) => user.type === UserType.LOCAL_USER,
    };
  });

  const buyerUserTypes = new Set<UserType>([
    UserType.LOCAL_USER,
    UserType.MEMBER,
    UserType.VOUCHER,
    UserType.INVOICE,
  ]);
  const buyerRole = await Role.save({ name: 'Buyer' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Container', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Product', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'PointOfSale', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'ProductCategory', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Transaction', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Transaction', action: 'create', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Authenticator', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Authenticator', action: 'update', relation: 'own', attributes: ['pin'] },
    ]);
    return {
      role,
      assignmentCheck: (user: User) => buyerUserTypes.has(user.type),
    };
  });

  const invoiceRole = await Role.save({ name: 'Invoice' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Balance', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Invoice', action: 'get', relation: 'own', attributes: star },
    ]);
    return {
      role,
      assignmentCheck: (user: User) => user.type === UserType.INVOICE,
    };
  });

  const authorizedBuyerUserTypes = new Set<UserType>([
    UserType.LOCAL_USER,
    UserType.MEMBER,
  ]);
  const authorizedBuyerRole = await Role.save({ name: 'AuthorizedBuyer' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Transaction', action: 'create', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Balance', action: 'update', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'StripeDeposit', action: 'create', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'StripeDeposit', action: 'create', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'own', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'acceptToS', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'update', relation: 'own', attributes: ['extensiveDataProcessing'] },
    ]);
    return {
      role,
      assignmentCheck: (user: User) => authorizedBuyerUserTypes.has(user.type),
    };
  });

  const sudososBacRole = await Role.save({ name: 'SudoSOS - BAC' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      ...getAdminPermissions(role, 'Transaction'),
      ...getAdminPermissions(role, 'VoucherGroup', false),
      ...getAdminPermissions(role, 'ProductCategory', false),
      { role, entity: 'Balance', action: 'get', relation: 'all', attributes: star },
    ]);
    return {
      role,
    };
  });

  const sudososBoardRole = await Role.save({ name: 'SudoSOS - Board' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      ...getAdminPermissions(role, 'Banner'),
      ...getAdminPermissions(role, 'VoucherGroup'),
      ...getAdminPermissions(role, 'User'),
    ]);
    return { role };
  });

  const sudososBacPmRole = await Role.save({ name: 'SudoSOS - BAC PM' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      ...getAdminPermissions(role, 'Authenticator'),
      ...getAdminPermissions(role, 'Container'),
      ...getAdminPermissions(role, 'Invoice'),
      ...getAdminPermissions(role, 'PayoutRequest'),
      ...getAdminPermissions(role, 'PointOfSale'),
      ...getAdminPermissions(role, 'ProductCategory'),
      ...getAdminPermissions(role, 'Product'),
      ...getAdminPermissions(role, 'Transaction'),
      ...getAdminPermissions(role, 'Transfer'),
      ...getAdminPermissions(role, 'VatGroup'),
      ...getAdminPermissions(role, 'User'),
      ...getAdminPermissions(role, 'Fine'),
      { role, entity: 'Fine', action: 'notify', relation: 'all', attributes: star },
    ]);
    return {
      role,
      assignmentCheck: (user: User) => user.type === UserType.LOCAL_ADMIN,
    };
  });

  const sudososAuditRole = await Role.save({ name: 'SudoSOS - Audit' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Invoice', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Invoice', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Transaction', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Transaction', action: 'get', relation: 'own', attributes: star },
      { roleId: role.id, role, entity: 'Transfer', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Transfer', action: 'get', relation: 'own', attributes: star },
    ]);
    return { role };
  });

  const sudososNarrowcastingRole = await Role.save({ name: 'SudoSOS - Narrowcasting' }).then(async (role): Promise<SeededRole> => {
    role.permissions = await Permission.save([
      { roleId: role.id, role, entity: 'Balance', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'PointOfSale', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Container', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'Product', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'get', relation: 'all', attributes: star },
      { roleId: role.id, role, entity: 'User', action: 'get', relation: 'organ', attributes: star },
    ]);
    return { role };
  });

  const roles = [
    userRole, localUserRole, buyerRole, invoiceRole, authorizedBuyerRole,
    sudososBacRole, sudososBoardRole, sudososBacPmRole, sudososAuditRole, sudososNarrowcastingRole,
  ];

  // const assignments: AssignedRole[] = [];
  // for (const user of users) {
  //   for (const { role, assignmentCheck } of roles) {
  //     if (!assignmentCheck || !assignmentCheck(user)) {
  //       return;
  //     }
  //     const dbUser = await User.findOne({ where: { id: user.id } });
  //     const dbRole = await Role.findOne({ where: { id: role.id } });
  //     const assignment = await AssignedRole.save({ roleId: role.id, role, userId: user.id, user }) as AssignedRole;
  //     user.roles.push(assignment);
  //     assignments.push(assignment);
  //   }
  // }

  const assignments = (await Promise.all(users.map(async (user) => {
    return Promise.all(roles.map(async (role) => {
      return assignRole(user, role);
    }));
  }))).flat().filter((a) => a != null);

  roles.forEach(({ role }) => {
    role.permissions.forEach((permission) => {
      permission.role = undefined;
    });
  });

  return {
    roles,
    assignments,
  };
}