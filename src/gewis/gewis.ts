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
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
import ADService, { LDAPGroup } from '../service/ad-service';
import AssignedRole from '../entity/roles/assigned-role';
import wrapInManager from '../helpers/database';
import { bindUser, getLDAPConnection, userFromLDAP } from '../helpers/ad';

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
   * This function creates a new user if needed and binds it to a GEWIS number and AD account.
   * @param manager - Reference to the EntityManager needed for the transaction.
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
        await bindUser(manager, ADUser, gewisUser.user);
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
   * @param manager - Reference to the EntityManager needed for the transaction.
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

  /**
   * Gives Users the correct role.
   *    Note that this creates Users if they do not exists in the LDAPAuth. table.
   * @param roleManager - Reference to the application role manager
   * @param role - Name of the role
   * @param users - LDAPUsers to give the role to
   */
  public static async addUsersToRole(manager: EntityManager, roleManager: RoleManager,
    role: string, users: LDAPUser[]) {
    const members = await ADService.getUsers(manager, users, true);
    await roleManager.setRoleUsers(members, role);
  }

  /**
   * Function that handles the updating of the AD roles as returned by the AD Query
   * @param roleManager - Reference to the application role manager
   * @param client - LDAP Client connection
   * @param roles - Roles returned from LDAP
   */
  private static async handleADRoles(manager: EntityManager, roleManager: RoleManager,
    client: Client, roles: LDAPGroup[]) {
    const promises: Promise<any>[] = [];
    roles.forEach((role) => {
      if (roleManager.containsRole(role.cn)) {
        promises.push(ADService.getLDAPGroupMembers(client, role.dn).then(async (result) => {
          const members: LDAPUser[] = result.searchEntries.map((u) => userFromLDAP(u));
          await Gewis.addUsersToRole(manager, roleManager, role.cn, members);
        }));
      }
    });

    await Promise.all(promises);
  }

  /**
   * Sync User Roles from AD
   * @param roleManager - Reference to the application role manager
   */
  public static async syncUserRoles(roleManager: RoleManager) {
    if (!process.env.LDAP_SERVER_URL) return;
    const client = await getLDAPConnection();

    const roles = await ADService.getLDAPGroups<LDAPGroup>(client, process.env.LDAP_ROLE_FILTER);
    if (!roles) return;

    await wrapInManager(Gewis.handleADRoles)(roleManager, client, roles);
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
      UserType.INVOICE,
      UserType.AUTOMATIC_INVOICE,
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
      },
      assignmentCheck: async (user: User) => buyerUserTypes.has(user.type),
    });

    /**
     * Define a BAC role, which indicates that the user
     * is a member of the BAr Committee group in AD.
     */
    this.roleManager.registerRole({
      name: 'SudoSOS - BAC',
      permissions: {
        Transaction: {
          get: { own: star, all: star },
          update: { own: star, all: star },
          delete: { own: star, all: star },
        },
        BorrelkaartGroup: {
          get: { all: star },
          update: { all: star },
          delete: { all: star },
          create: { all: star },
        },
      },
      assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - BAC', user } }) !== undefined,
    });

    const admin = {
      get: { own: star, all: star },
      update: { own: star, all: star },
      create: { own: star, all: star },
      delete: { own: star, all: star },
      approve: { own: star, all: star },
    };

    /**
     * Define a Board role, which indicates that the user
     * is a member of the Board group in AD.
     */
    this.roleManager.registerRole({
      name: 'SudoSOS - Board',
      permissions: {
        Transaction: {
          ...admin,
        },
        BorrelkaartGroup: {
          ...admin,
        },
        User: {
          ...admin,
        },
        Transfer: {
          ...admin,
        },
        Product: {
          ...admin,
        },
        PointOfSale: {
          ...admin,
        },
        Container: {
          ...admin,
        },
      },
      assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - Board', user } }) !== undefined,
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
          create: { own: star },
          read: { own: star },
        },
        Balance: {
          create: { own: star },
          read: { own: star },
          update: { own: star },
        },
        StripeDeposit: {
          create: { all: star },
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
          get: { own: star },
          update: { own: star },
        },
        Container: {
          create: { own: star },
          Get: { own: star },
          update: { own: star },
        },
        PointOfSale: {
          create: { own: star },
          read: { own: star },
          update: { own: star },
        },
        Balance: {
          create: { own: star },
          get: { own: star },
          update: { own: star },
        },
      },
      assignmentCheck: async (user: User) => sellerUserTypes.has(user.type),
    });
  }
}
