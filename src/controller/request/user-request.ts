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

import { UserType } from '../../entity/user/user';

export default interface BaseUserRequest {
  firstName: string;
  lastName?: string;
  nickname?: string;
  canGoIntoDebt: boolean;
  ofAge: boolean;
  email: string;
}

/**
 * @typedef {object} CreateUserRequest
 * @property {string} firstName.required
 * @property {string} lastName
 * @property {string} nickname
 * @property {boolean} canGoIntoDebt.required
 * @property {boolean} ofAge.required
 * @property {string} email.required
 * @property {number} type.required
 */
export interface CreateUserRequest extends BaseUserRequest {
  type: UserType;
}

/**
 * @typedef {object} UpdateUserRequest
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} nickname
 * @property {boolean} canGoIntoDebt
 * @property {boolean} ofAge
 * @property {string} email
 * @property {boolean} deleted
 * @property {boolean} active
 */
export interface UpdateUserRequest extends Partial<BaseUserRequest> {
  active?: boolean;
  deleted?: boolean;
}
