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
import { FindManyOptions, ObjectLiteral } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asNumber, asUserType } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import { BaseUserResponse, PaginatedUserResponse, UserResponse } from '../controller/response/user-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User, { UserType } from '../entity/user/user';
import CreateUserRequest from '../controller/request/create-user-request';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';

/**
 * Parameters used to filter on Get Users functions.
 */
export interface UserFilterParameters {
  firstName?: string,
  lastName?: string,
  active?: boolean,
  ofAge?: boolean,
  id?: number,
  email?: string,
  deleted?: boolean,
  type?: UserType,
  organId?: number,
}

/**
 * Extracts UserFilterParameters from the RequestWithToken
 * @param req - Request to parse
 */
export function parseGetUsersFilters(req: RequestWithToken): UserFilterParameters {
  const filters: UserFilterParameters = {
    firstName: req.query.firstName as string,
    lastName: req.query.lastName as string,
    active: req.query.active ? asBoolean(req.query.active) : undefined,
    ofAge: req.query.active ? asBoolean(req.query.ofAge) : undefined,
    id: asNumber(req.query.id),
    organId: asNumber(req.query.organ),
    email: req.query.email as string,
    deleted: req.query.active ? asBoolean(req.query.deleted) : false,
    type: asUserType(req.query.type),
  };

  return filters;
}

/**
 * Parses a raw user DB object to BaseUserResponse
 * @param user - User to parse
 * @param timestamps - Boolean if createdAt and UpdatedAt should be included
 */
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

/**
 * Parses a raw User DB object to a UserResponse
 * @param user - User to parse
 * @param timestamps - Boolean if createdAt and UpdatedAt should be included
 */
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
  /**
   * Function for getting al Users
   * @param filters - Query filters to apply
   * @param pagination - Pagination to adhere to
   */
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

    if (filters.organId) {
      // This allows us to search for organ members
      // However it does remove the other filters
      const userIds = await MemberAuthenticator
        .find({ where: { authenticateAs: filters.organId }, relations: ['user'] });
      (options.where as ObjectLiteral) = userIds.map((auth) => ({ id: auth.user.id }));
    }

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

  /**
   * Function for getting a single user based on ID
   * @param id - ID of the user to return
   * @returns User if exists
   * @returns undefined if user does not exits
   */
  public static async getSingleUser(id: number) {
    const user = await this.getUsers({ id, deleted: false });
    if (!user.records[0]) {
      return undefined;
    }
    return user.records[0];
  }

  /**
   * Function for creating a user
   * @param createUserRequest - The user to create
   * @returns The created user
   */
  public static async createUser(createUserRequest: CreateUserRequest) {
    const user = await User.save(createUserRequest as User);
    return Promise.resolve(this.getSingleUser(user.id));
  }

  /**
   * Function that checks if the users have overlapping member authentications.
   * @param left - User to check
   * @param right - User to check
   */
  public static async areInSameOrgan(left: number, right: number) {
    const leftAuth = await MemberAuthenticator.find({ where: { user: left }, relations: ['authenticateAs'] });
    const rightAuth = await MemberAuthenticator.find({ where: { user: right }, relations: ['authenticateAs'] });

    const rightIds = leftAuth.map((u) => u.authenticateAs.id);
    const overlap = rightAuth.map((u) => u.authenticateAs.id)
      .filter((u) => rightIds.indexOf(u) !== -1);

    return overlap.length > 0;
  }
}
