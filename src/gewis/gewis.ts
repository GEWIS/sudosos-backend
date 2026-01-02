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
 * This is the module page of GEWIS.
 *
 * @module GEWIS
 * @mergeTarget
 */

import User, { UserType } from '../entity/user/user';
import MemberUser from '../entity/user/member-user';
import AuthenticationService from '../service/authentication-service';
import { asNumber } from '../helpers/validators';
import { bindUser, LDAPUser } from '../helpers/ad';
import GewiswebToken from './gewisweb-token';
import WithManager from '../database/with-manager';

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
    let memberUser;

    try {
      const memberId = asNumber(ADUser.mNumber);
      // Check if Member User already exists.
      memberUser = await MemberUser.findOne({ where: { memberId }, relations: ['user'] });
      if (memberUser) {
        // If user exists we only have to bind the AD user
        await bindUser(this.manager, ADUser, memberUser.user);
      } else {
        // If m-account does not exist we create an account and bind it.
        const u = await new AuthenticationService(this.manager).createUserAndBind(ADUser);
        memberUser = await this.createMemberUser(u, memberId);
      }
    } catch (error) {
      return undefined;
    }

    return memberUser.user;
  }

  /**
   * Function that creates a SudoSOS user based on the payload provided by the GEWIS Web token.
   * @param token
   */
  public async createUserFromWeb(token: GewiswebToken): Promise<MemberUser> {
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
    return this.createMemberUser(u, token.lidnr);
  }

  /**
   * Function that turns a local User into a Member User.
   * @param user - The local user
   * @param memberId - Member ID of the user (e.g., GEWIS member ID)
   */
  public async createMemberUser(user: User, memberId: number): Promise<MemberUser> {
    const memberUser = Object.assign(new MemberUser(), {
      user,
      memberId,
    });

    await this.manager.save(memberUser);
    // 09-08-2022 (Roy): code block below (temporarily) disabled, because the huge amount of queries
    // in this chain makes the request too slow for the test suite
    //
    // // This would be the place to make a PIN Code and mail it to the user.
    // // This is not meant for production code
    // await AuthenticationService
    //   .setUserAuthenticationHash<PinAuthenticator>(user, memberId.toString(), PinAuthenticator);

    return memberUser;
  }
}
