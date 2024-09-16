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

import { FindManyOptions } from 'typeorm';
import DineroFactory from 'dinero.js';
import { VoucherGroupParams, VoucherGroupRequest } from '../controller/request/voucher-group-request';
import VoucherGroupResponse, {
  PaginatedVoucherGroupResponse,
} from '../controller/response/voucher-group-response';
import { UserResponse } from '../controller/response/user-response';
import Transfer from '../entity/transactions/transfer';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import VoucherGroup from '../entity/user/voucher-group';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';
import UserVoucherGroup from '../entity/user/user-voucher-group';
import { PaginationParameters } from '../helpers/pagination';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { parseUserToResponse } from '../helpers/revision-to-response';

export interface VoucherGroupFilterParameters {
  bkgId?: number,
}

export default class VoucherGroupService {
  /**
   * Verifies whether the voucher group request translates to a valid object
   * @returns {VoucherGroupParams.model} The parameter object from the request
   * @param req
   */
  static asVoucherGroupParams(req: VoucherGroupRequest): VoucherGroupParams {
    const startDate = new Date(req.activeStartDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(req.activeEndDate);
    endDate.setHours(23, 59, 59, 0);
    return {
      ...req,
      balance: DineroTransformer.Instance.from(req.balance.amount),
      activeStartDate: startDate,
      activeEndDate: endDate,
    };
  }

  /**
   * Verifies whether the voucher group request translates to a valid object
   * @param {VoucherGroupParams.model} bkgReq - The voucher group request
   * @returns {boolean} whether the voucher group is ok
   */
  static validateVoucherGroup(bkgReq: VoucherGroupParams): boolean {
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
      // voucher group must contain users
      && bkgReq.amount > 0;
  }

  static async updateBalance(users: User[], balance: DineroFactory.Dinero, isPositive = true) {
    const transfers = users.map((user) => Object.assign(new Transfer(), {
      description: '',
      amountInclVat: balance,
      from: isPositive ? undefined : user,
      to: isPositive ? user : undefined,
    }));
    return Transfer.save(transfers);
  }

  static asVoucherGroup(
    bkgReq: VoucherGroupParams,
  ): VoucherGroup {
    return Object.assign(new VoucherGroup(), {
      name: bkgReq.name,
      activeStartDate: bkgReq.activeStartDate,
      activeEndDate: bkgReq.activeEndDate,
      amount: bkgReq.amount,
      balance: bkgReq.balance,
    });
  }

  /**
   * Creates a voucher group from the request
   * @param {VoucherGroup.model} bkg - voucher group
   * @param {Array.<User>} users - users in the voucher group
   * @returns {VoucherGroupResponse.model} a voucher group response
   */
  public static asVoucherGroupResponse(
    bkg: VoucherGroup,
    users: User[],
  ): VoucherGroupResponse | undefined {
    // parse users to user responses if users in request
    const userResponses: UserResponse[] = [];
    if (users) {
      users.forEach((user) => {
        userResponses.push(parseUserToResponse(user, true));
      });
    }

    // return as voucher group response
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
   * Returns all voucher groups without users
   * @param filters
   * @param {PaginationParameters.model} params - find options
   * @returns {PaginatedVoucherGroupResponse} voucher groups without users
   */
  public static async getVoucherGroups(
    filters: VoucherGroupFilterParameters, params: PaginationParameters = {},
  ): Promise<PaginatedVoucherGroupResponse> {
    const { take, skip } = params;

    const mapping: FilterMapping = {
      bkgId: 'id',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(mapping, filters),
      relations: ['vouchers.user'],
    };
    const bkgs: VoucherGroup[] = await VoucherGroup.find({ ...options, take, skip });
    const records = bkgs.map((bkg) => this.asVoucherGroupResponse(bkg, bkg.vouchers.map((voucher) => voucher.user)));

    return {
      _pagination: {
        take,
        skip,
        count: await VoucherGroup.count(),
      },
      records,
    };
  }

  /**
   * Saves a voucher group and its user relations to the database
   * @param {VoucherGroupRequest.model} bkgReq - voucher group request
   * @returns {VoucherGroupResponse.model} saved voucher group
   */
  public static async createVoucherGroup(
    bkgReq: VoucherGroupParams,
  ): Promise<VoucherGroupResponse> {
    const users = await VoucherGroupService.createVoucherUsers(bkgReq.name, bkgReq.activeStartDate <= new Date(), bkgReq.amount);

    // save the voucher group
    const bkg = await VoucherGroup.save(this.asVoucherGroup(bkgReq));

    // create and save user voucher group links
    const userLinks = users.map(
      (user) => ({ user, voucherGroup: bkg } as UserVoucherGroup),
    );
    await UserVoucherGroup.save(userLinks);

    await this.updateBalance(users, bkgReq.balance);

    // return voucher group response with posted voucher group
    return this.asVoucherGroupResponse(bkg, users);
  }

  public static async createVoucherUsers(namePrefix: string, active: Boolean, amount: number, offset: number = 0): Promise<User[]> {
    const userObjects = [];
    for (let i = offset; i < amount; i += 1) {
      const firstName = `${namePrefix}_${i}`;
      userObjects.push(
        Object.assign(new User(), {
          firstName,
          active: active,
          type: UserType.VOUCHER,
          ofAge: true,
          acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
        } as User),
      );
    }
    // create voucher users
    return User.save(userObjects);
  }

  /**
   * Updates a voucher group and its user relations in the database
   * @param {string} id - requested voucher group id
   * @param {VoucherGroupRequest.model} bkgReq - new voucher group request
   * @returns {VoucherGroupResponse.model} updated voucher group
   * @returns {undefined} undefined when voucher group not found
   */
  public static async updateVoucherGroup(
    id: number,
    bkgReq: VoucherGroupParams,
  ): Promise<VoucherGroupResponse | undefined> {
    // current voucher group
    const bkgCurrent = await VoucherGroup.findOne({ where: { id } });
    if (!bkgCurrent) {
      return undefined;
    }

    // create new voucher group and update database
    await VoucherGroup.update(id, this.asVoucherGroup(bkgReq));
    const bkg = await VoucherGroup.findOne({ where: { id } });

    let usersCurrent = (
      await UserVoucherGroup.find({
        relations: ['user'],
        where: { voucherGroup: { id } },
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
      const users = await this.createVoucherUsers(bkgReq.name, bkgReq.activeStartDate <= new Date(), bkgReq.amount, bkgCurrent.amount);
      // save new user relations
      const userLinks = users.map(
        (user) => ({ user, voucherGroup: bkg } as UserVoucherGroup),
      );
      await UserVoucherGroup.save(userLinks);

      await this.updateBalance(users, bkgReq.balance);
      usersCurrent.push(...users);
    }

    // return created voucher group with users
    return this.asVoucherGroupResponse(bkg, usersCurrent);
  }
}
