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
import { LDAPUser } from '../entity/authenticator/ldap-authenticator';
import GewisUser from '../entity/user/gewis-user';
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';

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

  /**
   * This function creates an new user and binds it to a GEWIS number and AD account.
   * @param ADUser
   */
  public static async createGEWISUserAndBind(ADUser: LDAPUser): Promise<User> {
    console.error('Creating a new user');
    const regex = /(?<=m)\d*$/gm;
    const match = regex.exec(ADUser.sAMAccountName);
    let gewisUser;

    // Only allow m-accounts to sign in.
    if (!match) return undefined;
    try {
      const gewisId = asNumber(match[0]);
      // User is a valid GEWIS user and authenticated so we can start binding.
      gewisUser = await AuthenticationService.createUserAndBind(ADUser).then(async (u) => (
        (Promise.resolve(await Gewis.createGEWISUser(u, gewisId)))));
    } catch (error) {
      return undefined;
    }

    return gewisUser.user;
  }

  /**
   * Function that turns a local User into a GEWIS User.
   * @param user - The local user
   * @param gewisId - GEWIS member ID of the user
   */
  public static async createGEWISUser(user: User, gewisId: number): Promise<GewisUser> {
    console.error('Creating GEWIS USER');
    const gewisUser = Object.assign(new GewisUser(), {
      user,
      gewisId,
    });

    await GewisUser.save(gewisUser);
    console.error(gewisUser);

    // This would be the place to make a PIN Code and mail it to the user.
    // await AuthenticationService.setUserPINCode(user, gewisId.toString());

    return gewisUser;
  }

  async registerRoles(): Promise<void> {
    const star = new Set(['*']);

    // Temp for testing in a more realistic environment.
    const ownedEntity = {
      create: { own: star },
      get: { own: star, all: star },
      update: { own: star },
    };
    const publicPermissions = {
      Banner: {
        ...ownedEntity,
      },
      Container: {
        ...ownedEntity,
      },
      Product: {
        ...ownedEntity,
      },
      ProductCategories: {
        ...ownedEntity,
      },
      PointOfSale: {
        ...ownedEntity,
      },
      User: {
        get: { own: star, all: star },
        update: { own: star },
      },
    };

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
          get: { own: star },
        },
        Balance: {
          create: { own: star },
          get: { own: star },
          update: { own: star },
        },
        ...publicPermissions,
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
        Balance: {
          create: { own: star },
          read: { own: star },
          update: { own: star },
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
        Balance: {
          create: { all: star },
          read: { all: star },
          update: { all: star },
        },
      },
      assignmentCheck: async (user: User) => sellerUserTypes.has(user.type),
    });
  }
}
