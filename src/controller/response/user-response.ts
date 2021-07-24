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
import BaseResponse from './base-response';
import { UserType } from '../../entity/user/user';

/**
 * @typedef {BaseResponse} BaseUserResponse
 * @property {string} firstName.required - The name of the user.
 * @property {string} lastName - The last name of the user
 */
export interface UserResponse extends BaseResponse {
  firstName: string,
  lastName: string
}

/**
 * @typedef {BaseUserResponse} UserResponse
 * @property {boolean} active.required - Whether the user activated
 * @property {boolean} deleted.required - Whether the user is deleted
 * @property {UserType} type.required - The type of user
 */

export interface UserResponse extends BaseUserResponse {
  active: boolean;
  deleted: boolean;
  type: UserType;
}
