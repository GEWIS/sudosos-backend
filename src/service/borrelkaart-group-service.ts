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
import DineroFactory from 'dinero.js';
import { BorrelkaartGroupParams, BorrelkaartGroupRequest } from '../controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse, {
  PaginatedBorrelkaartGroupResponse,
} from '../controller/response/borrelkaart-group-response';
import { UserResponse } from '../controller/response/user-response';
import Transfer from '../entity/transactions/transfer';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';
import { PaginationParameters } from '../helpers/pagination';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { parseUserToResponse } from '../helpers/revision-to-response';

export interface BorrelkaartGroupFilterParameters {
  bkgId?: number,
}

export default class BorrelkaartGroupService {
  /**
   * Verifies whether the borrelkaart group request translates to a valid object
   * @returns {BorrelkaartGroupParams.model} The parameter object from the request
   * @param req
   */
  static asBorrelkaartGroupParams(req: BorrelkaartGroupRequest): BorrelkaartGroupParams {
    const startDate = new Date(req.activeStartDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(req.activeEndDate);
    endDate.setHours(23, 59, 59, 999);
    return {
      ...req,
      balance: DineroTransformer.Instance.from(req.balance.amount),
      activeStartDate: startDate,
      activeEndDate: endDate,
    };
  }

  /**
   * Verifies whether the borrelkaart group request translates to a valid object
   * @param {BorrelkaartGroupParams.model} bkgReq - The borrelkaart group request
   * @returns {boolean} whether the borrelkaart group is ok
   */
  static validateBorrelkaartGroup(bkgReq: BorrelkaartGroupParams): boolean {
    return bkgReq.name !== ''
      && bkgReq.activeEndDate instanceof Date
      && bkgReq.activeStartDate instanceof Date
      && !Number.isNaN(bkgReq.activeEndDate.valueOf())
      && !Number.isNaN(bkgReq.activeStartDate.valueOf())
      // end date connot be in the past
      && bkgReq.activeEndDate >= new Date()
      // end date must be later than start date
      && bkgReq.activeEndDate.getTime() > bkgReq.activeStartDate.getTime()
      && bkgReq.balance.isPositive()
      && !bkgReq.balance.isZero()
      // borrelkaart group must contain users
      && bkgReq.amount > 0;
  }

  static async updateBalance(users: User[], balance: DineroFactory.Dinero, isPositive = true) {
    const transfers = users.map((user) => Object.assign(new Transfer(), {
      description: '',
      amount: balance,
      from: isPositive ? undefined : user,
      to: isPositive ? user : undefined,
    }));
    return Transfer.save(transfers);
  }

  static asBorrelkaartGroup(
    bkgReq: BorrelkaartGroupParams,
  ): BorrelkaartGroup {
    return Object.assign(new BorrelkaartGroup(), {
      name: bkgReq.name,
      activeStartDate: bkgReq.activeStartDate,
      activeEndDate: bkgReq.activeEndDate,
      amount: bkgReq.amount,
      balance: bkgReq.balance,
    });
  }

  /**
   * Creates a borrelkaart group from the request
   * @param {BorrelkaartGroup.model} bkg - borrelkaart group
   * @param {Array.<User>} users - users in the borrelkaart group
   * @returns {BorrelkaartGroupResponse.model} a borrelkaart group response
   */
  public static asBorrelkaartGroupResponse(
    bkg: BorrelkaartGroup,
    users: User[],
  ): BorrelkaartGroupResponse | undefined {
    // parse users to user responses if users in request
    const userResponses: UserResponse[] = [];
    if (users) {
      users.forEach((user) => {
        userResponses.push(parseUserToResponse(user, true));
      });
    }

    // return as borrelkaart group response
    return {
      id: bkg.id,
      amount: bkg.amount,
      name: bkg.name,
      createdAt: bkg.createdAt.toISOString(),
      updatedAt: bkg.updatedAt.toISOString(),
      activeStartDate: bkg.activeStartDate.toISOString(),
      activeEndDate: bkg.activeEndDate.toISOString(),
      balance: bkg.balance.toObject(),
      users: userResponses,
    };
  }

  /**
   * Returns all borrelkaart groups without users
   * @param filters
   * @param {PaginationParameters.model} params - find options
   * @returns {PaginatedBorrelkaartGroupResponse} borrelkaart groups without users
   */
  public static async getBorrelkaartGroups(
    filters: BorrelkaartGroupFilterParameters, params: PaginationParameters = {},
  ): Promise<PaginatedBorrelkaartGroupResponse> {
    const { take, skip } = params;

    const mapping: FilterMapping = {
      bkgId: 'id',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(mapping, filters),
      relations: ['borrelkaarten.user'],
    };
    const bkgs: BorrelkaartGroup[] = await BorrelkaartGroup.find({ ...options, take, skip });
    const records = bkgs.map((bkg) => this.asBorrelkaartGroupResponse(bkg, bkg.borrelkaarten.map((borrelkaart) => borrelkaart.user)));

    return {
      _pagination: {
        take,
        skip,
        count: await BorrelkaartGroup.count(),
      },
      records,
    };
  }

  /**
   * Saves a borrelkaart group and its user relations to the database
   * @param {BorrelkaartGroupRequest.model} bkgReq - borrelkaart group request
   * @returns {BorrelkaartGroupResponse.model} saved borrelkaart group
   */
  public static async createBorrelkaartGroup(
    bkgReq: BorrelkaartGroupParams,
  ): Promise<BorrelkaartGroupResponse> {
    const users = await BorrelkaartGroupService.createBorrelkaartUsers(bkgReq.name, bkgReq.activeStartDate <= new Date(), bkgReq.amount);

    // save the borrelkaart group
    const bkg = await BorrelkaartGroup.save(this.asBorrelkaartGroup(bkgReq));

    // create and save user borrelkaart group links
    const userLinks = users.map(
      (user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup),
    );
    await UserBorrelkaartGroup.save(userLinks);

    await this.updateBalance(users, bkgReq.balance);

    // return borrelkaart group response with posted borrelkaart group
    return this.asBorrelkaartGroupResponse(bkg, users);
  }

  public static async createBorrelkaartUsers(namePrefix: string, active: Boolean, amount: number, offset: number = 0): Promise<User[]> {
    const userObjects = [];
    for (let i = offset; i < amount; i += 1) {
      const firstName = `${namePrefix}_${i}`;
      userObjects.push(
        Object.assign(new User(), {
          firstName,
          active: active,
          type: UserType.BORRELKAART,
          ofAge: true,
          acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
        } as User),
      );
    }
    // create borrelkaart users
    return User.save(userObjects);
  }

  /**
   * Updates a borrelkaart group and its user relations in the database
   * @param {string} id - requested borrelkaart group id
   * @param {BorrelkaartGroupRequest.model} bkgReq - new borrelkaart group request
   * @returns {BorrelkaartGroupResponse.model} updated borrelkaart group
   * @returns {undefined} undefined when borrelkaart group not found
   */
  public static async updateBorrelkaartGroup(
    id: number,
    bkgReq: BorrelkaartGroupParams,
  ): Promise<BorrelkaartGroupResponse | undefined> {
    // current borrelkaart group
    const bkgCurrent = await BorrelkaartGroup.findOne({ where: { id } });
    if (!bkgCurrent) {
      return undefined;
    }

    // create new borrelkaart group and update database
    await BorrelkaartGroup.update(id, this.asBorrelkaartGroup(bkgReq));
    const bkg = await BorrelkaartGroup.findOne({ where: { id } });

    let usersCurrent = (
      await UserBorrelkaartGroup.find({
        relations: ['user'],
        where: { borrelkaartGroup: { id } },
      })
    ).map((ubkg) => ubkg.user);

    if (bkgReq.activeStartDate <= new Date()) {
      usersCurrent = usersCurrent.map((user) => (
        Object.assign(new User(), { ...user, active: true })));
      await User.save(usersCurrent);
    }

    const saldoChange = bkgReq.balance.subtract(bkgCurrent.balance);

    if (saldoChange.isPositive()) {
      await this.updateBalance(usersCurrent, saldoChange, true);
    } else if (saldoChange.isNegative()) {
      await this.updateBalance(usersCurrent, saldoChange.multiply(-1), false);
    }

    if (bkgCurrent.amount < bkgReq.amount) {
      const users = await this.createBorrelkaartUsers(bkgReq.name, bkgReq.activeStartDate <= new Date(), bkgReq.amount, bkgCurrent.amount);
      // save new user relations
      const userLinks = users.map(
        (user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup),
      );
      await UserBorrelkaartGroup.save(userLinks);

      await this.updateBalance(users, bkgReq.balance);
      usersCurrent.push(...users);
    }

    // return created borrelkaart group with users
    return this.asBorrelkaartGroupResponse(bkg, usersCurrent);
  }
}
