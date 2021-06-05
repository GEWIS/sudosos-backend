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
import User, { UserType } from '../entity/user/user';
import RoleManager from '../rbac/role-manager';

/**
 * The GEWIS-specific module with definitions and helper functions.
 */
export default class Gewis {
  /**
   * A reference to the role manager instance.
   */
  private roleManager: RoleManager;

  /**
   * Creates a new GEWIS-specific module class.
   * @param roleManager - The current role manager instance.
   */
  public constructor(roleManager: RoleManager) {
    this.roleManager = roleManager;
  }

  async registerRoles(): Promise<void> {
    const star = new Set(['*']);

    /**
     * Define a Buyer role, which indicates that the user
     * is allowed to create transactions for itself.
     */
    const buyerUserTypes = new Set<UserType>([
      UserType.LOCAL_USER,
      UserType.MEMBER,
      UserType.BORRELKAART,
    ]);
    this.roleManager.registerRole({
      name: 'Buyer',
      permissions: {
        Transaction: {
          create: { own: star },
          read: { own: star },
        },
      },
      assignmentCheck: async (user: User) => buyerUserTypes.has(user.type),
    });

    /**
     * Define an Authorized Buyer role, which indicates that the user
     * is allowed to create transactions for other people.
     */
    const authorizedBuyerUserTypes = new Set<UserType>([
      UserType.LOCAL_USER,
      UserType.MEMBER,
    ]);
    this.roleManager.registerRole({
      name: 'AuthorizedBuyer',
      permissions: {
        Transaction: {
          create: { created: star },
          read: { created: star },
        },
      },
      assignmentCheck: async (user: User) => authorizedBuyerUserTypes.has(user.type),
    });

    /**
     * Define a Seller role, which indicates that the user
     * can manage sellable products.
     */
    const sellerUserTypes = new Set<UserType>([
      UserType.LOCAL_ADMIN,
      UserType.ORGAN,
    ]);
    this.roleManager.registerRole({
      name: 'Seller',
      permissions: {
        Product: {
          create: { own: star },
          read: { own: star },
          update: { own: star },
        },
        Container: {
          create: { own: star },
          read: { own: star },
          update: { own: star },
        },
        PointOfSale: {
          create: { own: star },
          read: { own: star },
          update: { own: star },
        },
      },
      assignmentCheck: async (user: User) => sellerUserTypes.has(user.type),
    });
  }
}
