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
import User from '../entity/user/user';
import { LDAPUser } from '../entity/authenticator/ldap-authenticator';
import AuthenticationService from '../service/authentication-service';

/**
 * Class used for setting default functions or bindings.
 *    For example, this allows the behaviour of user creation to be changed easily.
 *    In this case it is used to inject GEWIS related code without editing the files themselves.
 */
export default class Bindings {
  /**
   * Function called when an unbound User is found and created.
   */
  public static ldapUserCreation: (manager: EntityManager,
    ADUser: LDAPUser) => Promise<User> = AuthenticationService.createUserAndBind;
}
