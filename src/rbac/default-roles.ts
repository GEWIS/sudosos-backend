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
import { UserType } from '../entity/user/user';
import { PermissionDefinition } from './role-manager';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import RBACService from '../service/rbac-service';
import { DeepPartial, In, Not } from 'typeorm';
import RoleUserType from '../entity/rbac/role-user-type';

interface DefaultRole {
  name: string;
  userTypes: UserType[],
  permissions: PermissionDefinition;
}

const star = new Set(['*']);
const admin = {
  get: { own: star, all: star },
  update: { own: star, all: star },
  create: { own: star, all: star },
  delete: { own: star, all: star },
};

/**
 * Static class defining all default roles present in SudoSOS.
 * These roles are hardcoded and cannot be changed by the user.
 * They should only contain basic functionality that is bound
 * to one or more types of users.
 */
export default class DefaultRoles {
  public static get definitions(): DefaultRole[] {
    return [{
      name: 'User',
      userTypes: [UserType.MEMBER, UserType.ORGAN, UserType.VOUCHER, UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.INVOICE],
      permissions: {
        Balance: {
          get: { own: star },
        },
        User: {
          get: { own: star },
        },
        Authenticator: {
          get: { own: star },
        },
        Transfer: {
          get: { own: star },
        },
        Transaction: {
          get: { own: star },
        },
        VatGroup: {
          get: { all: star },
        },
      },
    }, {
      name: 'Local User',
      userTypes: [UserType.LOCAL_USER],
      permissions: {
        Authenticator: {
          update: { own: new Set(['password']) },
        },
        User: {
          update: { own: new Set(['email']) },
        },
      },
    }, {
      /**
       * Define a Buyer role, which indicates that the user
       * is allowed to create transactions for itself.
       */
      name: 'Buyer',
      userTypes: [UserType.MEMBER, UserType.VOUCHER, UserType.LOCAL_USER, UserType.INVOICE],
      permissions: {
        Container: {
          get: { all: star },
        },
        Product: {
          get: { all: star },
        },
        PointOfSale: {
          get: { all: star },
        },
        ProductCategory: {
          get: { all: star },
        },
        Transaction: {
          create: { own: star },
        },
        Authenticator: {
          update: { own: new Set(['pin']) },
        },
      },
    }, {
      /**
       * Invoice users
       */
      name: 'Invoice',
      userTypes: [UserType.INVOICE],
      permissions: {
        Balance: {
          update: { own: star },
        },
        Invoice: {
          get: { own: star },
        },
      },
    }, {
      /**
       * Define an Authorized Buyer role, which indicates that the user
       * is allowed to create transactions for other people.
       */
      name: 'AuthorizedBuyer',
      userTypes: [UserType.LOCAL_USER, UserType.MEMBER],
      permissions: {
        Transaction: {
          create: { all: star },
        },
        Balance: {
          update: { own: star },
        },
        StripeDeposit: {
          create: { own: star, all: star },
        },
        User: {
          get: { all: star },
          acceptToS: { own: star },
          update: { own: new Set(['extensiveDataProcessing']) },
        },
      },
    }, {
      name: 'Super admin',
      userTypes: [UserType.LOCAL_ADMIN],
      permissions: {
        Authenticator: admin,
        Balance: admin,
        Banner: admin,
        Container: admin,
        Invoice: admin,
        Fine: {
          ...admin,
          notify: { all: star },
        },
        PayoutRequest: admin,
        PointOfSale: admin,
        ProductCategory: admin,
        Product: admin,
        Transaction: admin,
        Transfer: admin,
        User: admin,
        VatGroup: admin,
        VoucherGroup: admin,
      },
    }];
  }

  /**
   * Synchronize a single default role with the database
   * @param roleDefinition
   * @private
   */
  private static async synchronizeRole(roleDefinition: DefaultRole): Promise<Role> {
    let role = await Role.findOne({
      where: { name: roleDefinition.name },
      relations: { permissions: true },
    });
    let permissions: Permission[];

    if (!role) {
      role = await Role.save({
        name: roleDefinition.name,
      });
      permissions = [];
    } else {
      permissions = role.permissions;
    }

    const userTypesToAdd = roleDefinition.userTypes.filter((t) => !role.userTypes?.includes(t));
    const userTypesToDelete = role.userTypes?.filter((t) => !roleDefinition.userTypes.includes(t));
    await Promise.all([
      RoleUserType.save(userTypesToAdd.map((userType): DeepPartial<RoleUserType> => ({ role, roleId: role.id, userType }))),
      RoleUserType.delete({ roleId: role.id, userType: In(userTypesToDelete ?? []) }),
    ]);

    role.systemDefault = true;
    await Role.save(role);

    const rules = RBACService.definitionToRules(roleDefinition.permissions);
    const rulesToAdd = rules.filter((r1) => !permissions
      .some((r2) => r1.entity === r2.entity
        && r1.action === r2.action
        && r1.relation === r2.relation
        && JSON.stringify(r1.attributes) === JSON.stringify(r2.attributes)));
    const rulesToRemove = permissions.filter((r1) => !rules
      .some((r2) => r1.entity === r2.entity
      && r1.action === r2.action
      && r1.relation === r2.relation
      && JSON.stringify(r1.attributes) === JSON.stringify(r2.attributes)));

    await Promise.all([
      Permission.save(rulesToAdd.map((p): DeepPartial<Permission> => ({
        ...p,
        role,
        roleId: role.id,
      }))),
      await Permission.remove(rulesToRemove),
    ]);

    return Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
  }

  /**
   * Synchronize all default roles with the database
   */
  public static async synchronize(): Promise<Role[]> {
    const roleNames = this.definitions.map((d) => d.name);
    // Delete all roles that are no longer system default
    await Role.delete({ name: Not(In(roleNames)), systemDefault: true });

    return Promise.all(this.definitions.map(async (d) => this.synchronizeRole(d)));
  }
}
