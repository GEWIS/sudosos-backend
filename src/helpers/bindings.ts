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
 * This is the module page of the bindings.
 *
 * @module helpers
 */

import { SelectQueryBuilder } from 'typeorm';
import User from '../entity/user/user';
import AuthenticationService from '../service/authentication-service';
import { LDAPUser } from './ad';
import { parseRawUserToResponse, parseUserToResponse, RawUser } from './revision-to-response';
import { UserResponse } from '../controller/response/user-response';
import { AppDataSource } from '../database/database';


/**
 * Class used for setting default functions or bindings.
 *    For example, this allows the behaviour of user creation to be changed easily.
 *    In this case it is used to inject GEWIS related code without editing the files themselves.
 */
export default class Bindings {

  public static onNewUserCreate: () => (ADUser: LDAPUser) => Promise<User> = () => {
    const service = new AuthenticationService();
    return service.createUserAndBind.bind(service);
  };

  /**
   * Function called when mapping db user entities to responses.
   */
  public static parseUserToResponse: (user: User,
    timestamps: boolean) => UserResponse = parseUserToResponse;

  public static Users: {
    parseToResponse: (user: RawUser,
      timestamps: boolean) => UserResponse
    getBuilder: () => SelectQueryBuilder<User>
  } = {
      parseToResponse: parseRawUserToResponse,
      getBuilder: () => AppDataSource.createQueryBuilder().from(User, 'user').orderBy({ 'user.id': 'ASC' }),
    };
}
