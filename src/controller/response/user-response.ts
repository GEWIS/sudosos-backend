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
 * This is the module page of the user-response.
 *
 * @module users
 */

import BaseResponse from './base-response';
import { PaginationResult } from '../../helpers/pagination';
import { TermsOfServiceStatus } from '../../entity/user/user';

/**
 * @typedef {allOf|BaseResponse} BaseUserResponse
 * @property {string} firstName.required - The name of the user.
 * @property {string} lastName.required - The last name of the user
 * @property {string} nickname - The nickname of the user
 */
export interface BaseUserResponse extends BaseResponse {
  firstName: string,
  lastName: string,
  nickname?: string,
}

/**
 * @typedef {allOf|BaseUserResponse} UserResponse
 * @property {boolean} active.required - Whether the user activated
 * @property {boolean} deleted.required - Whether the user is deleted
 * @property {string} type.required - The type of user
 * @property {string} email - If local user, the e-mail of the user
 * @property {string} acceptedToS - Whether this user has accepted the TOS
 * @property {boolean} extensiveDataProcessing - Whether data about this
 * user can be used (non-anonymously) for more data science!
 * @property {boolean} ofAge - Whether someone is old enough to drink beer
 * @property {boolean} canGoIntoDebt.required - Whether this user can get a negative balance
 */
export interface UserResponse extends BaseUserResponse {
  active: boolean;
  deleted: boolean;
  type: string;
  email?: string;
  acceptedToS?: TermsOfServiceStatus,
  extensiveDataProcessing?: boolean;
  ofAge?: boolean;
  canGoIntoDebt: boolean;
}


/**
 * @typedef {object} InvoiceUserResponse
 * @property {BaseUserResponse} user.required - User linked to the defaults.
 * @property {string} street.required - Default street to use for invoices.
 * @property {string} postalCode.required - Default postal code to use for invoices.
 * @property {string} city.required - Default city to use for invoices.
 * @property {string} country.required - Default country to use for invoices.
 * @property {boolean} automatic.required - Whether invoices should be automatically generated
 */
export interface InvoiceUserResponse {
  user: BaseUserResponse,
  street: string;
  postalCode:string;
  city: string;
  country: string;
  automatic: boolean,
}

/**
 * @typedef {object} PaginatedUserResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<UserResponse>} records.required - Returned users
 */
export interface PaginatedUserResponse {
  _pagination: PaginationResult,
  records: UserResponse[],
}
