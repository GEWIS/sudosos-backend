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
 * @property {string} type.required
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
 * @property {boolean} extensiveDataProcessing
 */
export interface UpdateUserRequest extends Partial<BaseUserRequest> {
  active?: boolean;
  deleted?: boolean;
  extensiveDataProcessing?: boolean
}


/**
 * @typedef {object} UpdateInvoiceUserRequest
 * @property {string} street.required - Default street to use for invoices.
 * @property {string} postalCode.required - Default postal code to use for invoices.
 * @property {string} city.required - Default city to use for invoices.
 * @property {string} country.required - Default country to use for invoices.
 * @property {boolean} automatic.required - Whether invoices should be automatically generated
 */
export interface UpdateInvoiceUserRequest {
  street: string;
  postalCode:string;
  city: string;
  country: string;
  automatic: boolean,
}
