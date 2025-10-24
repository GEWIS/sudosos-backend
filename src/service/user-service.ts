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
 * This is the module page of the user-service.
 *
 * @module users
 */

import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asDate, asNumber, asUserType } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import { PaginatedUserResponse, UserResponse } from '../controller/response/user-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User, { LocalUserTypes, TermsOfServiceStatus, TOSRequired, UserType } from '../entity/user/user';
import OrganMembership from '../entity/organ/organ-membership';
import { CreateUserRequest, UpdateUserRequest } from '../controller/request/user-request';
import TransactionService, { TransactionFilterParameters } from './transaction-service';
import {
  FinancialMutationResponse,
  PaginatedFinancialMutationResponse,
} from '../controller/response/financial-mutation-response';
import TransferService, { TransferFilterParameters } from './transfer-service';
import Mailer from '../mailer';
import WelcomeToSudosos from '../mailer/messages/welcome-to-sudosos';
import { AcceptTosRequest } from '../controller/request/accept-tos-request';
import Bindings from '../helpers/bindings';
import AuthenticationService from './authentication-service';
import WelcomeWithReset from '../mailer/messages/welcome-with-reset';
import { Brackets, In } from 'typeorm';
import BalanceService from './balance-service';
import AssignedRole from '../entity/rbac/assigned-role';
import Role from '../entity/rbac/role';

/**
 * Parameters used to filter on Get Users functions.
 */
export interface UserFilterParameters {
  search?: string,
  active?: boolean,
  ofAge?: boolean,
  id?: number | number[],
  deleted?: boolean,
  type?: UserType,
  organId?: number,
  assignedRoleIds?: number | number[],
}

export type FinancialMutationsFilterParams = TransactionFilterParameters & TransferFilterParameters;

/**
 * Extracts UserFilterParameters from the RequestWithToken
 * @param req - Request to parse
 */
export function parseGetUsersFilters(req: RequestWithToken): UserFilterParameters {
  let assignedRoleIds: number[];
  if (req.query.assignedRoleIds && Array.isArray(req.query.assignedRoleIds)) {
    assignedRoleIds = req.query.assignedRoleIds.map((r) => Number(r));
  } else if (req.query.assignedRoleIds) {
    assignedRoleIds = [Number(req.query.assignedRoleIds)];
  }

  return {
    search: req.query.search as string,
    active: req.query.active ? asBoolean(req.query.active) : undefined,
    ofAge: req.query.active ? asBoolean(req.query.ofAge) : undefined,
    id: asNumber(req.query.id),
    assignedRoleIds,
    organId: asNumber(req.query.organ),
    deleted: req.query.active ? asBoolean(req.query.deleted) : false,
    type: asUserType(req.query.type),
  };
}

export function parseGetFinancialMutationsFilters(req: RequestWithToken): FinancialMutationsFilterParams {
  return {
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
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
      active: 'active',
      ofAge: 'ofAge',
      id: 'id',
      deleted: 'deleted',
      type: 'type',
    };

    const f = filters;
    if (filters.organId) {
      // This allows us to search for organ members
      const userIds = await OrganMembership
        .find({ where: { organ: { id: filters.organId } }, relations: ['user'] });
      f.id = userIds.map((auth) => auth.user.id);
    }
    if (filters.assignedRoleIds) {
      // Get all user IDs of the user belonging to any of the given roles
      const assignedRoles = await AssignedRole
        .find({ where: { roleId: In(filters.assignedRoleIds as number[]) } });
      const userIds = assignedRoles.map((r) => r.userId);
      if (f.id && Array.isArray(f.id)) {
        // If we already have a list of IDs to filter on, we need to filter on the intersection
        f.id = f.id.filter((id) => userIds.includes(id));
      } else if (f.id) {
        // If we only have a single ID to filter on, only keep it if it exists in one of the roles
        f.id = userIds.includes(f.id as number) ? f.id : [];
      } else {
        // No existing filter on user ID, so we set the filter to the list of users in these groups
        f.id = userIds;
      }
    }

    const builder = Bindings.Users.getBuilder();
    builder.where(`user.type NOT IN ("${UserType.POINT_OF_SALE}")`);

    QueryFilter.applyFilter(builder, filterMapping, f);
    // Note this is only for MySQL
    if (filters.search) {
      const escapeLikeWildcard = (value: string) => value.replace(/[%_]/g, '\\$&');
      const searchTerms = filters.search.split(' ').slice(0, 2).map(term => `%${escapeLikeWildcard(term)}%`);
      const fullNameSearch = `%${escapeLikeWildcard(filters.search)}%`;

      builder.andWhere(new Brackets(qb => {
        qb.where('CONCAT(user.firstName, \' \', user.nickname, \' \', user.lastName) LIKE :name')
          .orWhere('CONCAT(user.firstName, \' \', user.lastName) LIKE :name');

        searchTerms.forEach((term, index) => {
          qb.orWhere(`user.firstName LIKE :term${index}`)
            .orWhere(`user.nickname LIKE :term${index}`)
            .orWhere(`user.lastName LIKE :term${index}`)
            .orWhere(`user.email LIKE :term${index}`);
        });
      }), {
        name: fullNameSearch,
        ...Object.fromEntries(searchTerms.map((term, index) => [`term${index}`, term])),
      });
    }

    builder.orderBy('user.id', 'DESC');

    const users = await builder.limit(take).offset(skip).getRawMany();
    const count = await builder.getCount();

    const records = users.map((u) => Bindings.Users.parseToResponse(u, true));

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
    // Check if user needs to accept TOS.
    const acceptedToS = TOSRequired.includes(createUserRequest.type) ? TermsOfServiceStatus.NOT_ACCEPTED : TermsOfServiceStatus.NOT_REQUIRED;
    const user = await User.save({
      ...createUserRequest,
      lastName: createUserRequest.lastName || '',
      acceptedToS,
    } as User);

    // Local users will receive a reset link.
    if (LocalUserTypes.includes(user.type)) {
      const resetTokenInfo = await new AuthenticationService().createResetToken(user);
      Mailer.getInstance().send(user, new WelcomeWithReset({ email: user.email, resetTokenInfo })).then().catch((e) => {
        throw e;
      });
    } else {
      Mailer.getInstance().send(user, new WelcomeToSudosos({})).then().catch((e) => {
        throw e;
      });
    }
    return Promise.resolve(this.getSingleUser(user.id));
  }

  /**
   * Closes a user account by setting the user's status to deleted and inactive.
   * Also, it sets canGoIntoDebt to false.
   *
   * @param {number} userId - The ID of the user to close the account for.
   * @param deleted - Whether the user is being deleted or not.
   * @throws Error if the user has a non-zero balance and is being deleted.
   * @returns {Promise<void>} - A promise that resolves when the user account has been closed.
   */
  public static async closeUser(userId: number, deleted = false): Promise<UserResponse> {
    const user = await User.findOne({ where: { id: userId, deleted: false } });
    if (!user) return undefined;

    const balance = await new BalanceService().getBalance(userId);
    const isZero = balance.amount.amount === 0;
    if (deleted && !isZero) {
      throw new Error('Cannot delete user with non-zero balance.');
    }

    user.deleted = deleted;
    user.active = false;
    user.canGoIntoDebt = false;

    await user.save();
    // Correctly parsed to expected response
    return this.getUsers({ id: userId }).then((u) => u.records[0]);
  }

  /**
   * Updates the user object with the new properties.
   * @param userId - ID of the user to update.
   * @param updateUserRequest - The update object.
   */
  public static async updateUser(userId: number, updateUserRequest: UpdateUserRequest):
  Promise<UserResponse> {
    const user = await User.findOne({ where: { id: userId } });
    if (!user) return undefined;
    Object.assign(user, updateUserRequest);
    await user.save();
    return this.getSingleUser(userId);
  }

  /**
   * Accept the ToS for the user with the given ID.
   * @param userId - ID of the user to accept the ToS for.
   * @param params
   * @returns boolean - Whether the request has successfully been processed
   */
  public static async acceptToS(userId: number, params: AcceptTosRequest): Promise<boolean> {
    const user = await User.findOne({ where: { id: userId } });
    if (!user) return false;

    if (user.acceptedToS === TermsOfServiceStatus.ACCEPTED) return false;
    user.acceptedToS = TermsOfServiceStatus.ACCEPTED;
    user.extensiveDataProcessing = params.extensiveDataProcessing;
    await user.save();
    return true;
  }

  /**
   * Combined query to return a users transfers and transactions from the database
   * @param user - The user of which to get.
   * @param filters - Filter parameters to adhere to
   * @param paginationParameters - Pagination Parameters to adhere to.
   */
  public static async getUserFinancialMutations(
    user: User,
    filters: FinancialMutationsFilterParams = {},
    paginationParameters: PaginationParameters = {},
  ): Promise<PaginatedFinancialMutationResponse> {
    // Since we are combining two different queries the pagination works a bit different.
    const take = (paginationParameters.skip ?? 0) + (paginationParameters.take ?? 0);
    const pagination: PaginationParameters = {
      take,
      skip: 0,
    };

    const transactions = await (new TransactionService()).getTransactions(filters, pagination, user);
    const transfers = await (new TransferService()).getTransfers(filters, pagination, user);
    const financialMutations: FinancialMutationResponse[] = [];

    transactions.records.forEach((mutation) => {
      financialMutations.push({ type: 'transaction', mutation });
    });

    transfers.records.forEach((mutation) => {
      financialMutations.push({ type: 'transfer', mutation });
    });

    // Sort based on descending creation date.
    financialMutations.sort((a, b) => (a.mutation.createdAt < b.mutation.createdAt ? 1 : -1));
    // Apply pagination
    const mutationRecords = financialMutations.slice(paginationParameters.skip,
      paginationParameters.skip + paginationParameters.take);

    return {
      _pagination: {
        take: paginationParameters.take ?? 0,
        skip: paginationParameters.skip ?? 0,
        // eslint-disable-next-line no-underscore-dangle
        count: transactions._pagination.count + transfers._pagination.count,
      },
      records: mutationRecords,
    };
  }

  /**
   * Assigns a role to a user.
   * Does not error if user does already have the role.
   * @param user - User to add role to
   * @param role - Role to add
   */
  public static async addUserRole(user: User, role: Role) {
    if (await AssignedRole.findOne({ where: { userId: user.id, roleId: role.id } })) return;

    const assignedRole = new AssignedRole();
    assignedRole.userId = user.id;
    assignedRole.roleId = role.id;
    return assignedRole.save();
  }

  /**
   * Removes assigned role from user.
   * Does not error if user does not have role.
   * @param user - User to remove role from
   * @param role - Role to remove
   */
  public static async deleteUserRole(user: User, role: Role) {
    const assignedRole = await AssignedRole.findOne({ where: { userId: user.id, roleId: role.id } });
    if (!assignedRole) return;
    return assignedRole.remove();
  }

  /**
   * Function that checks if the users have overlapping member authentications.
   * @param left - User to check
   * @param right - User to check
   */
  public static async areInSameOrgan(left: number, right: number) {
    const leftAuth = await OrganMembership.find({ where: { user: { id: left } }, relations: ['organ'] });
    const rightAuth = await OrganMembership.find({ where: { user: { id: right } }, relations: ['organ'] });

    const rightIds = leftAuth.map((u) => u.organ.id);
    const overlap = rightAuth.map((u) => u.organ.id)
      .filter((u) => rightIds.indexOf(u) !== -1);

    return overlap.length > 0;
  }
}
