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
import { FindManyOptions } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asNumber, asUserType } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import { BaseUserResponse, PaginatedUserResponse, UserResponse } from '../controller/response/user-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User, { UserType } from '../entity/user/user';
import CreateUserRequest from '../controller/request/create-user-request';
import UpdateUserRequest, {UpdateUserParams} from '../controller/request/update-user-request';

export interface UserFilterParameters {
  firstName?: string,
  lastName?: string,
  active?: boolean,
  ofAge?: boolean,
  id?: number,
  email?: string,
  deleted?: boolean,
  type?: UserType,
}

export function parseGetUsersFilters(req: RequestWithToken): UserFilterParameters {
  const filters: UserFilterParameters = {
    firstName: req.query.firstName ? String(req.query.firstName) : undefined,
    lastName: req.query.lastName ? String(req.query.lastName) : undefined,
    active: req.query.active ? asBoolean(req.query.active) : undefined,
    ofAge: req.query.ofAge ? asBoolean(req.query.ofAge) : undefined,
    id: req.query.id ? asNumber(req.query.id) : undefined,
    email: req.query.email ? String(req.query.email) : undefined,
    deleted: req.query.deleted ? asBoolean(req.query.deleted) : false,
    type: req.query.type ? asUserType(req.query.type) : undefined,
  };

  return filters;
}

// eslint-disable-next-line import/prefer-default-export
export function parseUserToBaseResponse(user: User, timestamps: boolean): BaseUserResponse {
  if (!user) return undefined;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: timestamps ? user.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? user.updatedAt.toISOString() : undefined,
  } as BaseUserResponse;
}

export function parseUserToResponse(user: User, timestamps = false): UserResponse {
  if (!user) return undefined;
  return {
    ...parseUserToBaseResponse(user, timestamps),
    active: user.active,
    deleted: user.deleted,
    type: UserType[user.type],
  };
}

export default class UserService {
  public static async getUsers(
    filters: UserFilterParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedUserResponse> {
    const { take, skip } = pagination;

    const filterMapping: FilterMapping = {
      firstName: 'firstName',
      lastName: 'lastName',
      active: 'active',
      ofAge: 'ofAge',
      id: 'id',
      email: 'email',
      deleted: 'deleted',
      type: 'type',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, filters),
      skip,
    };

    const users = await User.find({ ...options, take });
    const count = await User.count(options);
    const records = users.map((u) => parseUserToResponse(u, true));

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  public static async getSingleUser(id: number) {
    const user = await this.getUsers({ id, deleted: false });
    if (!user.records[0]) {
      return undefined;
    }
    return user.records[0];
  }

  public static async createUser(createUserRequest: CreateUserRequest) {
    const user = await User.save(createUserRequest as User);
    return Promise.resolve(this.getSingleUser(user.id));
  }

  public static async updateUser(updateUserRequest: UpdateUserParams) {
    const user = await User.findOne(parameters.id, { where: { deleted: false } });
  }
}
