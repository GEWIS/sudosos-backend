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
 *
 *  @license
 */

/**
 * This is the module page of GEWIS.
 *
 * @module GEWIS
 * @mergeTarget
 */

import User, { UserType } from '../entity/user/user';
import GewisUser from './entity/gewis-user';
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
import { bindUser, LDAPUser } from '../helpers/ad';
import GewiswebToken from './gewisweb-token';
import { parseRawUserToResponse, RawUser } from '../helpers/revision-to-response';
import Bindings from '../helpers/bindings';
import { GewisUserResponse } from './controller/response/gewis-user-response';
import { AppDataSource } from '../database/database';
import WithManager from '../database/with-manager';

export interface RawGewisUser extends RawUser {
  gewisId: number
}

/**
 * The GEWIS-specific module with definitions and helper functions.
 */
export default class Gewis extends WithManager {
  /**
   * This function creates a new user if needed and binds it to a GEWIS number and AD account.
   * @param ADUser
   */
  public async findOrCreateGEWISUserAndBind(ADUser: LDAPUser): Promise<User> {
    // The employeeNumber is the leading truth for m-number.
    if (!ADUser.mNumber) return undefined;
    let gewisUser;

    try {
      const gewisId = asNumber(ADUser.mNumber);
      // Check if GEWIS User already exists.
      gewisUser = await GewisUser.findOne({ where: { gewisId }, relations: ['user'] });
      if (gewisUser) {
        // If user exists we only have to bind the AD user
        await bindUser(this.manager, ADUser, gewisUser.user);
      } else {
        // If m-account does not exist we create an account and bind it.
        const u = await new AuthenticationService(this.manager).createUserAndBind(ADUser);
        gewisUser = await this.createGEWISUser(u, gewisId);
      }
    } catch (error) {
      return undefined;
    }

    return gewisUser.user;
  }

  /**
   * Function that creates a SudoSOS user based on the payload provided by the GEWIS Web token.
   * @param token
   */
  public async createUserFromWeb(token: GewiswebToken): Promise<GewisUser> {
    const user = Object.assign(new User(), {
      firstName: token.given_name,
      lastName: (token.middle_name.length > 0 ? `${token.middle_name} ` : '') + token.family_name,
      type: UserType.MEMBER,
      active: true,
      email: token.email,
      ofAge: token.is_18_plus,
      canGoIntoDebt: true,
    } as User) as User;
    const u = await this.manager.save(user);
    return this.createGEWISUser(u, token.lidnr);
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
    return AppDataSource.createQueryBuilder()
      .from(User, 'user')
      .leftJoin(GewisUser, 'gewis_user', 'userId = id')
      .orderBy('userId', 'ASC');
  }

  /**
   * Function that turns a local User into a GEWIS User.
   * @param user - The local user
   * @param gewisId - GEWIS member ID of the user
   */
  public async createGEWISUser(user: User, gewisId: number): Promise<GewisUser> {
    const gewisUser = Object.assign(new GewisUser(), {
      user,
      gewisId,
    });

    await this.manager.save(gewisUser);
    // 09-08-2022 (Roy): code block below (temporarily) disabled, because the huge amount of queries
    // in this chain makes the request too slow for the test suite
    //
    // // This would be the place to make a PIN Code and mail it to the user.
    // // This is not meant for production code
    // await AuthenticationService
    //   .setUserAuthenticationHash<PinAuthenticator>(user, gewisId.toString(), PinAuthenticator);

    return gewisUser;
  }

  public static ldapUserCreation: () => (ADUser: LDAPUser) => Promise<User> = () => {
    const service = new Gewis();
    return service.findOrCreateGEWISUserAndBind.bind(service);
  };

  // eslint-disable-next-line class-methods-use-this
  static overwriteBindings() {
    Bindings.onNewUserCreate = Gewis.ldapUserCreation;
    Bindings.Users = {
      parseToResponse: Gewis.parseRawUserToGewisResponse,
      getBuilder: Gewis.getUserBuilder,
    };
  }
}
