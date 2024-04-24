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
import GewiswebToken from '../gewisweb-token';
import { MemberAllAttributes } from 'gewisdb-ts-client';
import { UpdateUserRequest } from '../../controller/request/user-request';

export function webResponseToUpdate(response: GewiswebToken | MemberAllAttributes): Pick<UpdateUserRequest, 'firstName' | 'lastName' | 'email' | 'ofAge'> {
  const update: UpdateUserRequest = {};
  if (response.given_name !== undefined) update.firstName = response.given_name;
  if (response.family_name !== undefined) update.lastName = `${response.middle_name ? `${response.middle_name} ` : ''}${response.family_name}`;
  if (response.email !== undefined) update.email = response.email;
  if (response.is_18_plus !== undefined) update.ofAge = response.is_18_plus;
  return update;
}
