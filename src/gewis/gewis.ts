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
import { EntityManager } from 'typeorm';
import { Client } from 'ldapts';
import User, { UserType } from '../entity/user/user';
import RoleManager from '../rbac/role-manager';
import { LDAPUser } from '../entity/authenticator/ldap-authenticator';
import GewisUser from '../entity/user/gewis-user';
// eslint-disable-next-line import/no-cycle
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
// eslint-disable-next-line import/no-cycle
import ADService, { LDAPGroup } from '../service/ad-service';
import AssignedRole from '../entity/roles/assigned-role';

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
   * This function creates an new user if needed and binds it to a GEWIS number and AD account.
   * @param ADUser
   */
  public static async findOrCreateGEWISUserAndBind(manager: EntityManager, ADUser: LDAPUser)
    : Promise<User> {
    // The employeeNumber is the leading truth for m-number.
    if (!ADUser.mNumber) return undefined;
    let gewisUser;

    try {
      const gewisId = asNumber(ADUser.mNumber);
      // Check if GEWIS User already exists.
      gewisUser = await GewisUser.findOne({ where: { gewisId }, relations: ['user'] });
      if (gewisUser) {
        // If user exists we only have to bind the AD user
        await ADService.bindUser(manager, ADUser, gewisUser.user);
      } else {
        // If m-account does not exist we create an account and bind it.
        gewisUser = await AuthenticationService
          .createUserAndBind(manager, ADUser).then(async (u) => (
            (Promise.resolve(await Gewis.createGEWISUser(manager, u, gewisId)))));
      }
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
  public static async createGEWISUser(manager: EntityManager, user: User, gewisId: number)
    : Promise<GewisUser> {
    const gewisUser = Object.assign(new GewisUser(), {
      user,
      gewisId,
    });

    await GewisUser.save(gewisUser);
    // This would be the place to make a PIN Code and mail it to the user.
    // This is not meant for production code
    await AuthenticationService.setUserPINCode(user, gewisId.toString());

    return gewisUser;
  }

  public static async addUsersToRole(roleManager: RoleManager, role: string, users: LDAPUser[]) {
    const members = await ADService.getUsers(users, true);
    await roleManager.setRoleUsers(members, role);
  }

  private static async handleADRoles(roleManager: RoleManager, client: Client, roles: LDAPGroup[]) {
    const promises: Promise<any>[] = [];
    roles.forEach((role) => {
      if (roleManager.containsRole(role.cn)) {
        promises.push(ADService.getLDAPGroupMembers(client, role.dn).then(async (result) => {
          const members: LDAPUser[] = result.searchEntries.map((u) => ADService.userFromLDAP(u));
          await Gewis.addUsersToRole(roleManager, role.cn, members);
        }));
      }
    });

    await Promise.all(promises);
  }

  public static async syncUserRoles(roleManager: RoleManager) {
    if (!process.env.LDAP_SERVER_URL) return;
    const client = await ADService.getLDAPConnection();

    const roles = await ADService.getLDAPGroups<LDAPGroup>(client, process.env.LDAP_ROLE_FILTER);
    if (!roles) return;

    await Gewis.handleADRoles(roleManager, client, roles);
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
          create: { own: star, all: star },
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

    this.roleManager.registerRole({
      name: 'SudoSOS - BAC',
      permissions: {
        Product: {
          get: { all: star },
          update: { all: star },
        },
      },
      assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - BAC', user } }) !== undefined,
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
