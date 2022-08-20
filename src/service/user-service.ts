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
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asNumber, asUserType } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import { PaginatedUserResponse, UserResponse } from '../controller/response/user-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User, { LocalUserTypes, TermsOfServiceStatus, TOSRequired, UserType } from '../entity/user/user';
import CreateUserRequest from '../controller/request/create-user-request';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import UpdateUserRequest from '../controller/request/update-user-request';
import TransactionService from './transaction-service';
import {
  FinancialMutationResponse,
  PaginatedFinancialMutationResponse,
} from '../controller/response/financial-mutation-response';
import TransferService from './transfer-service';
import Mailer from '../mailer';
import WelcomeToSudosos from '../mailer/templates/welcome-to-sudosos';
import { AcceptTosRequest } from '../controller/request/accept-tos-request';
import Bindings from '../helpers/bindings';
import AuthenticationService from './authentication-service';
import WelcomeWithReset from '../mailer/templates/welcome-with-reset';

/**
 * Parameters used to filter on Get Users functions.
 */
export interface UserFilterParameters {
  firstName?: string,
  lastName?: string,
  active?: boolean,
  ofAge?: boolean,
  id?: number | number[],
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

    const f = filters;
    if (filters.organId) {
      // This allows us to search for organ members
      const userIds = await MemberAuthenticator
        .find({ where: { authenticateAs: { id: filters.organId } }, relations: ['user'] });
      f.id = userIds.map((auth) => auth.user.id);
    }

    const builder = Bindings.Users.getBuilder();

    QueryFilter.applyFilter(builder, filterMapping, f);
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
    const user = await User.save({ ...createUserRequest, acceptedToS } as User);

    // Local users will receive a reset link.
    if (LocalUserTypes.includes(user.type)) {
      const resetTokenInfo = await AuthenticationService.createResetToken(user);
      Mailer.getInstance().send(user, new WelcomeWithReset({ email: user.email, name: user.firstName, resetTokenInfo }));
    } else {
      Mailer.getInstance().send(user, new WelcomeToSudosos({ name: user.firstName }));
    }
    return Promise.resolve(this.getSingleUser(user.id));
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
   * @param paginationParameters - Pagination Parameters to adhere to.
   */
  public static async getUserFinancialMutations(user: User,
    paginationParameters: PaginationParameters = {}): Promise<PaginatedFinancialMutationResponse> {
    // Since we are combining two different queries the pagination works a bit different.
    const take = (paginationParameters.skip ?? 0) + (paginationParameters.take ?? 0);
    const pagination: PaginationParameters = {
      take,
      skip: 0,
    };

    const transactions = await TransactionService.getTransactions({}, pagination, user);
    const transfers = await TransferService.getTransfers({}, pagination, user);
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
   * Function that checks if the users have overlapping member authentications.
   * @param left - User to check
   * @param right - User to check
   */
  public static async areInSameOrgan(left: number, right: number) {
    const leftAuth = await MemberAuthenticator.find({ where: { user: { id: left } }, relations: ['authenticateAs'] });
    const rightAuth = await MemberAuthenticator.find({ where: { user: { id: right } }, relations: ['authenticateAs'] });

    const rightIds = leftAuth.map((u) => u.authenticateAs.id);
    const overlap = rightAuth.map((u) => u.authenticateAs.id)
      .filter((u) => rightIds.indexOf(u) !== -1);

    return overlap.length > 0;
  }
}
