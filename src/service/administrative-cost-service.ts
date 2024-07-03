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


import { FindManyOptions, FindOptionsRelations } from 'typeorm';
import InactivityAdministrativeCosts from '../entity/transactions/inactivity-administrative-costs';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { PaginationParameters } from '../helpers/pagination';
import {
  BaseInactivityAdministrativeCostsResponse,
} from '../controller/response/inactivity-administrative-costs-response';
import { parseUserToResponse } from '../helpers/revision-to-response';
import BalanceService from './balance-service';
import User from '../entity/user/user';
import { BaseInactivityAdministrativeCostsParams } from '../controller/request/inactivity-administrative-costs-request';
import TransferService from './transfer-service';
import TransferRequest from '../controller/request/transfer-request';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import Transaction from '../entity/transactions/transaction';
import Transfer from '../entity/transactions/transfer';

/**
 * Parameters for type of administrative cost, notification or fine
 */
export interface InactivityAdministrativeCostFilterParameters {
  /**
   * Filter based on userId
   */
  userId?: number,

  /**
   * Filter based on whether you check for a fine or notification.
   */
  fine?: boolean,
}

export default class AdministrativeCostService {

  private static yearCheck(date: Date, fine: boolean) : boolean {
    const difference = new Date(Date.now() - date.getTime());

    if (fine) {
      if (difference.getFullYear() - 1970 >= 3) return true;
    }
    if (!fine) {
      if (difference.getFullYear() - 1970 == 2) return true;
    }

    return false;
  }

  private static asInactivityAdministrativeCostResponse(records: InactivityAdministrativeCosts)
    : BaseInactivityAdministrativeCostsResponse {
    return {
      id: records.id,
      createdAt: records.createdAt.toISOString(),
      updatedAt: records.updatedAt.toISOString(),
      from: parseUserToResponse(records.from, false),
      amount: records.amount,
      lastTransactionId: records.lastTransactionId,
      lastTransferId: records.lastTransferId,
    };
  }

  public static async checkInactivityAdministrativeCosts(filter: InactivityAdministrativeCostFilterParameters = {})
    : Promise<User[]> {
    const allUsers = await User.find();
    const inactiveUsers: User[] = [];


    for (let i = 0; i < allUsers.length; i += 1) {
      const user = allUsers[i];

      const transaction = await Transaction.find({
        relations: { from: true },
        where: { from: { id: user.id } },
        take: 1,
        order: { createdAt: 'DESC' },
      });
      const transfer = (await Transfer.find({
        relations: { administrativeCosts: false, from: true },
        where: { from: { id: user.id } },
        take: 1,
        order: { createdAt: 'DESC' },
      } ));
      const fine = filter.fine;

      if (transaction != null && transfer != null) {
        if (this.yearCheck(transaction[0].createdAt, fine) && this.yearCheck(transfer[0].createdAt, fine)) inactiveUsers.push(user);
      } else if (transaction != null) {
        if (this.yearCheck(transaction[0].createdAt, fine)) inactiveUsers.push(user);
      } else if (transfer != null) {
        if  (this.yearCheck(transfer[0].createdAt, fine)) inactiveUsers.push(user);
      }
    }

    return inactiveUsers;
  }

  /**
   * Verifies whether a user has a sufficient balance to make administrative costs
   * @param {number} userId - the transaction request to verify
   * @returns {boolean} - whether user's balance is ok or not
   */
  public static async positiveBalance(userId: number): Promise<boolean> {
    // get user balance and compare
    const userBalance = (await BalanceService.getBalance(userId)).amount.amount;

    // return whether user balance is sufficient to complete the transaction
    return userBalance > 0;
  }

  /**
   * Creates an inactivity administrative cost for users
   * @param inactivityAdministrativeCost - The new inactivity administrative costs parameters
   */
  public static async createInactivityAdministrativeCost(inactivityAdministrativeCost: BaseInactivityAdministrativeCostsParams)
    : Promise<InactivityAdministrativeCosts> {
    const from = await User.findOne( { where: { id: inactivityAdministrativeCost.fromId } });

    if (!from) return undefined;

    const balance = await BalanceService.getBalance(from.id);

    const dineroBalance = DineroTransformer.Instance.from(balance.amount.amount);
    const fineDinero = DineroTransformer.Instance.from(10);

    const amount = (dineroBalance.greaterThanOrEqual(fineDinero)) ? 10 : balance.amount.amount;

    const transfer: TransferRequest = {
      amount: {
        amount: amount,
        precision: balance.amount.precision,
        currency: balance.amount.currency,
      },
      description: '',
      fromId: inactivityAdministrativeCost.fromId,
      toId: undefined,
    };

    const createdInactivityAdministrativeCost = Object.assign(new InactivityAdministrativeCosts(), {
      from: from,
      amount: DineroTransformer.Instance.from(amount),
      lastTransactionId: inactivityAdministrativeCost.lastTransactionId,
      lastTransferId: inactivityAdministrativeCost.lastTransferId,
      transfer: await TransferService.createTransfer(transfer),
    });

    await InactivityAdministrativeCosts.save(createdInactivityAdministrativeCost);

    const options = this.getOptions({ userId: createdInactivityAdministrativeCost.fromId } );
    return InactivityAdministrativeCosts.findOne(options);
  }

  /**
   * Function that returns all users which have made inactivity administrative costs
   * @param filters - The filter parameters
   */
  public static async getInactivityAdministrativeCost(filters: InactivityAdministrativeCostFilterParameters = {})
    : Promise<InactivityAdministrativeCosts[]> {
    const options = { ...this.getOptions(filters) };

    return InactivityAdministrativeCosts.find({ ...options });
  }

  /**
   * Function that return all the invoices based on the given params.
   * Returns the AdministrativeCostResponse
   * @param filters - The filter parameters
   * @param pagination - The pagination params to apply
   */
  public static async getPaginatedInactivityAdministrativeCosts(filters: InactivityAdministrativeCostFilterParameters = {},
    pagination: PaginationParameters = {}) {
    const { take, skip } = pagination;
    const options = { ...this.getOptions(filters), skip, take };

    const inactivityAdministrativeCosts = await InactivityAdministrativeCosts.find({ ...options, take });

    const records = inactivityAdministrativeCosts.map(this.asInactivityAdministrativeCostResponse);
    const count = await InactivityAdministrativeCosts.count(options);

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  public static getOptions(params: InactivityAdministrativeCostFilterParameters): FindManyOptions<InactivityAdministrativeCosts> {
    const filterMapping: FilterMapping = {
      userId: 'from.id',
    };
  
    const relations: FindOptionsRelations<InactivityAdministrativeCosts> = { from: true,  transfer: true };
    const options: FindManyOptions<InactivityAdministrativeCosts> = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      order: { createdAt: 'ASC' },
    };

    return { ...options, relations };
  }


}