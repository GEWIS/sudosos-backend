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
 * This is the module page of the role-definitions.
 *
 * @module rbac
 */

import { UserType } from '../entity/user/user';
import { PermissionDefinition } from './role-definitions';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import RBACService from '../service/rbac-service';
import { DeepPartial, In, Not } from 'typeorm';
import RoleUserType from '../entity/rbac/role-user-type';

export const SELLER_ROLE = 'Seller';

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
          update: { own: new Set(['settings']) },
          authenticate: {
            own: new Set(['pointOfSale']),
            organ: new Set(['pointOfSale']),
          },
        },
        Roles: {
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
        Wrapped: {
          get: { own: star },
          update: { own: star },
        },
        UserNotificationPreference: {
          get: { own: star },
          update: { own: star },
        },
        TermsOfService: {
          get: { own: star },
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
        Transaction: {
          create: { own: star },
        },
        Authenticator: {
          update: { own: new Set(['pin', 'nfcCode']) },
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
          acceptToS: { own: star },
          update: { own: new Set(['extensiveDataProcessing']) },
        },
      },
    }, {
      /**
       * The POS user role, which is used by point of sales to fetch relevant data
       */
      name: 'Point of Sale',
      userTypes: [UserType.POINT_OF_SALE],
      permissions: {
        User: {
          // Explicitly list allowed attributes to exclude sensitive fields such as email.
          get: { all: new Set(['id', 'memberId', 'firstName', 'lastName', 'nickname', 'active',
            'deleted', 'type', 'acceptedToS', 'extensiveDataProcessing',
            'ofAge', 'canGoIntoDebt']) },
        },
        Balance: {
          get: { all: star },
        },
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
          get: { own: star },
        },
      },
    }, {
      name: 'Super admin',
      userTypes: [UserType.LOCAL_ADMIN],
      permissions: {
        Maintenance: {
          override: { all: star },
          update: { all: star },
        },
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
        SellerPayout: admin,
        Permission: admin,
        PointOfSale: admin,
        ProductCategory: admin,
        Product: admin,
        Role: admin,
        Transaction: admin,
        Transfer: admin,
        Roles: admin,
        ServerSettings: admin,
        User: {
          ...admin,
          acceptToS: { own: star },
          authenticate: { all: star },
        },
        VatGroup: admin,
        VoucherGroup: admin,
        WriteOff: admin,
        InactiveAdministrativeCost: admin,
        Wrapped: {
          get: { own: star },
          update: { own: star },
          override: { all: star },
        },
        UserNotificationPreference: admin,
        FinancialOverview: admin,
        TermsOfService: admin,
      },
    }, {
      name: SELLER_ROLE,
      userTypes: [],
      permissions: {
        Product: {
          get: { own: star, organ: star, all: star },
        },
        Container: {
          get: { own: star, organ: star, all: star },
        },
        PointOfSale: {
          get: { own: star, organ: star, all: star },
        },
        ProductCategory: {
          get: { organ: star },
        },
        Balance: {
          get: { organ: star },
        },
        Transaction: {
          get: { organ: star },
        },
        Transfer: {
          get: { organ: star },
        },
        PayoutRequest: {
          create: { organ: star },
          get: { organ: star },
        },
        User: {
          get: { all: star, organ: star },
        },
        FinancialOverview: {
          get: { organ: star },
        },
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

    if (!role) {
      role = await Role.save({
        name: roleDefinition.name,
      });
    }

    const permissions = role.permissions ?? [];

    // Get a list of all user types that are currently missing from the role
    const userTypesToAdd = roleDefinition.userTypes.filter((t) => !role.userTypes?.includes(t));
    // Get a list of all user types that should not be linked to this role
    const userTypesToDelete = role.userTypes?.filter((t) => !roleDefinition.userTypes.includes(t));
    // In parallel, add the new user types and remove any old user types from this role
    await Promise.all([
      RoleUserType.save(userTypesToAdd.map((userType): DeepPartial<RoleUserType> => ({ role, roleId: role.id, userType }))),
      RoleUserType.delete({ roleId: role.id, userType: In(userTypesToDelete ?? []) }),
    ]);

    // Set the role to system default, because this role might be new
    role.systemDefault = true;
    await Role.save(role);

    // Convert the user-readable permissions object to a list of individual permissions
    const rules = RBACService.definitionToRules(roleDefinition.permissions);
    // Get a list of all permissions that are currently missing from the role
    const rulesToAdd = rules.filter((r1) => !permissions
      .some((r2) => r1.entity === r2.entity
        && r1.action === r2.action
        && r1.relation === r2.relation
        && JSON.stringify(r1.attributes) === JSON.stringify(r2.attributes)));
    // Get a list of all permissions that should no longer exist for this role
    const rulesToRemove = permissions.filter((r1) => !rules
      .some((r2) => r1.entity === r2.entity
      && r1.action === r2.action
      && r1.relation === r2.relation
      && JSON.stringify(r1.attributes) === JSON.stringify(r2.attributes)));

    // In parallel, add the new permission s and remove any old ones
    await Promise.all([
      Permission.save(rulesToAdd.map((p): DeepPartial<Permission> => ({
        ...p,
        role,
        roleId: role.id,
      }))),
      await Permission.remove(rulesToRemove),
    ]);

    // Return the updated role with its permissions
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
