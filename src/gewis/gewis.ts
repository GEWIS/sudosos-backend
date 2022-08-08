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
import { createQueryBuilder, EntityManager } from 'typeorm';
import User, { UserType } from '../entity/user/user';
import RoleManager from '../rbac/role-manager';
import GewisUser from '../entity/user/gewis-user';
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
import AssignedRole from '../entity/roles/assigned-role';
import { bindUser, LDAPUser } from '../helpers/ad';
import GewiswebToken from './gewisweb-token';
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import { parseRawUserToResponse, RawUser } from '../helpers/revision-to-response';
import { UserResponse } from '../controller/response/user-response';
import Bindings from '../helpers/bindings';

/**
 * @typedef {UserResponse} GewisUserResponse
 * @property {integer} mNumber - The m-Number of the user
 */
export interface GewisUserResponse extends UserResponse {
  gewisId: number
}

export interface RawGewisUser extends RawUser {
  gewisId: number
}

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
   * Function that creates a SudoSOS user based on the payload provided by the GEWIS Web token.
   * @param manager
   * @param token
   */
  public static async createUserFromWeb(manager: EntityManager, token: GewiswebToken):
  Promise<GewisUser> {
    const user = Object.assign(new User(), {
      firstName: token.given_name,
      lastName: (token.middle_name.length > 0 ? `${token.middle_name} ` : '') + token.family_name,
      type: UserType.MEMBER,
      active: true,
      email: token.email,
      ofAge: token.is_18_plus,
    }) as User;
    return manager.save(user).then((u) => Gewis.createGEWISUser(manager, u, token.lidnr));
  }

  /**
   * Parses a raw User DB object to a UserResponse
   * @param user - User to parse
   * @param timestamps - Boolean if createdAt and UpdatedAt should be included
   */
  public static parseRawUserToGewisResponse(user: RawGewisUser, timestamps = false)
    : GewisUserResponse {
    if (!user) return undefined;
    return {
      ...parseRawUserToResponse(user, timestamps),
      gewisId: user.gewisId,
    };
  }

  public static getUserBuilder() {
    return createQueryBuilder()
      .from(User, 'user')
      .leftJoin(GewisUser, 'gewis_user', 'userId = id');
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

    await manager.save(gewisUser);
    // This would be the place to make a PIN Code and mail it to the user.
    // This is not meant for production code
    await AuthenticationService
      .setUserAuthenticationHash<PinAuthenticator>(user, gewisId.toString(), PinAuthenticator);

    return gewisUser;
  }

  // eslint-disable-next-line class-methods-use-this
  static overwriteBindings() {
    Bindings.ldapUserCreation = Gewis.findOrCreateGEWISUserAndBind;
    Bindings.Users = {
      parseToResponse: Gewis.parseRawUserToGewisResponse,
      getBuilder: Gewis.getUserBuilder,
    };
  }

  async registerRoles(): Promise<void> {
    const star = new Set(['*']);

    /**
     * Basic permissions for every signed in person.
     */
    this.roleManager.registerRole({
      name: 'User',
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
      assignmentCheck: async () => true,
    });

    this.roleManager.registerRole({
      name: 'Local User',
      permissions: {
        Authenticator: {
          update: { own: new Set(['password']) },
          get: { own: star },
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });

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
        Authenticator: {
          update: { own: new Set(['pin']) },
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
        User: {
          get: { all: star, own: star },
          acceptToS: { own: star },
        },
      },
      assignmentCheck: async (user: User) => authorizedBuyerUserTypes.has(user.type),
    });

    /**
     * Define a Seller role, which indicates that the user
     * can manage sellable products.
     */
    this.roleManager.registerRole({
      name: 'Seller',
      permissions: {
        Product: {
          create: { organ: star },
          get: { own: star, organ: star, all: star },
          update: { organ: star },
          approve: { organ: star },
        },
        Container: {
          create: { organ: star },
          get: { own: star, organ: star, all: star },
          update: { organ: star },
          approve: { organ: star },
        },
        PointOfSale: {
          create: { organ: star },
          get: { own: star, organ: star, all: star },
          update: { organ: star },
          approve: { organ: star },
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
      },
      /**
       * This role is actually assigned during token sign for optimization.
       * @see {AuthenticationService.makeJsonWebToken}
       */
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
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
        VatGroup: {
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
