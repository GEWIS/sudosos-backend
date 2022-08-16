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
import {
  Column, Entity,
} from 'typeorm';
import AuthenticationMethod from './authentication-method';

/**
 * @typedef {AuthenticationMethod} LDAPAuthenticator
 * @property {User.model} User.required - The user this authenticator is for
 * @property {UUID} accountName.required - The associated AD account name
 */
@Entity()
export default class LDAPAuthenticator extends AuthenticationMethod {
  @Column({
    length: 128,
    type: process.env.TYPEORM_CONNECTION === 'sqlite' ? 'varchar' : 'bytes',
  })
  public UUID: string;
}
