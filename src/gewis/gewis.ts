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
import User, { UserType } from '../entity/user/user';
import RoleManager from '../rbac/role-manager';
import { LDAPUser } from '../entity/authenticator/ldap-authenticator';
import GewisUser from '../entity/user/gewis-user';
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
import AssignedRole from '../entity/roles/assigned-role';
import { bindUser } from '../helpers/ad';

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
        Balance: {
          get: { own: star },
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
          create: { own: star },
          get: { own: star },
        },
        User: {
          get: { own: star },
        },
      },
      assignmentCheck: async (user: User) => buyerUserTypes.has(user.type),
    });

    /**
     * Invoice users
     */
    const invoiceUserTypes = new Set<UserType>([
      UserType.INVOICE,
      UserType.AUTOMATIC_INVOICE,
    ]);
    this.roleManager.registerRole({
      name: 'Invoice',
      permissions: {
        Balance: {
          update: { own: star },
        },
        Invoice: {
          get: { own: star },
        },
      },
      assignmentCheck: async (user: User) => invoiceUserTypes.has(user.type),
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
          create: { all: star },
        },
        Balance: {
          update: { own: star },
        },
        StripeDeposit: {
          create: { own: star, all: star },
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
          get: { own: star },
          update: { own: star },
        },
        PointOfSale: {
          create: { own: star },
          get: { own: star },
          update: { own: star },
        },
        Balance: {
          get: { own: star },
        },
        Transaction: {
          get: { own: star },
        },
        Transfer: {
          get: { own: star },
        },
        PayoutRequest: {
          create: { own: star },
          get: { own: star },
        },
      },
      assignmentCheck: async (user: User) => sellerUserTypes.has(user.type),
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
          create: { own: star, all: star },
          update: { own: star, all: star },
          delete: { own: star, all: star },
        },
        BorrelkaartGroup: {
          get: { all: star },
          update: { all: star },
          delete: { all: star },
          create: { all: star },
        },
        ProductCategory: {
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
        Banner: {
          ...admin,
        },
        BorrelkaartGroup: {
          ...admin,
        },
        User: {
          ...admin,
        },
      },
      assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - Board', user } }) !== undefined,
    });

    /**
     * Define a BAC Treasurer role, which indicates that the user
     * is the BAC Treasurer.
     */
    this.roleManager.registerRole({
      name: 'SudoSOS - BAC PM',
      permissions: {
        Container: {
          ...admin,
        },
        Invoice: {
          ...admin,
        },
        PayoutRequest: {
          ...admin,
        },
        PointOfSale: {
          ...admin,
        },
        ProductCategory: {
          ...admin,
        },
        Product: {
          ...admin,
        },
        Transaction: {
          ...admin,
        },
        Transfer: {
          ...admin,
        },
      },
      assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - BAC PM', user } }) !== undefined,
    });

    /**
     * Define a Audit Committee role, which indicates that the user
     * is a part of the Audit Committee.
     */
    this.roleManager.registerRole({
      name: 'SudoSOS - Audit',
      permissions: {
        Invoice: {
          get: { all: star, own: star },
        },
        Transaction: {
          get: { all: star, own: star },
        },
        Transfer: {
          get: { all: star, own: star },
        },
      },
      assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - Audit', user } }) !== undefined,
    });
  }
}
