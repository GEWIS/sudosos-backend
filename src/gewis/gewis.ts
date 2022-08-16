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
import GewisUser from './entity/gewis-user';
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
import { bindUser, LDAPUser } from '../helpers/ad';
import GewiswebToken from './gewisweb-token';
import { parseRawUserToResponse, RawUser } from '../helpers/revision-to-response';
import Bindings from '../helpers/bindings';
import { GewisUserResponse } from './entity/gewis-user-response';
import { register } from './roles/register-default-roles';

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
      .leftJoin(GewisUser, 'gewis_user', 'userId = id')
      .orderBy('userId', 'ASC');
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
    // 09-08-2022 (Roy): code block below (temporarily) disabled, because the huge amount of queries
    // in this chain makes the request too slow for the test suite
    //
    // // This would be the place to make a PIN Code and mail it to the user.
    // // This is not meant for production code
    // await AuthenticationService
    //   .setUserAuthenticationHash<PinAuthenticator>(user, gewisId.toString(), PinAuthenticator);

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
    register(this.roleManager);
  }
}
