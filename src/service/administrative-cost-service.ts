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

import { PaginationParameters } from '../helpers/pagination';
import BalanceService from './balance-service';
import User from '../entity/user/user';
import { createQueryBuilder, In, SelectQueryBuilder } from 'typeorm';
import Transaction from '../entity/transactions/transaction';
import Transfer from '../entity/transactions/transfer';
import {
  PaginatedInactivityAdministrativeCostsResponse,
} from '../controller/response/inactivity-administrative-costs-response';
import InactivityAdministrativeCosts from '../entity/transactions/inactivity-administrative-costs';

/**
 * Parameters for type of administrative cost, notification or fine
 */

export interface AdministrativeFilterParameters {
  userId?: number,
  notification?: boolean,
  fine?: boolean,
}

export default class AdministrativeCostService {

  private static async buildGetAdministrativeCostUsers(userId: number): SelectQueryBuilder<InactivityAdministrativeCosts> {

    const selection = [
      'administrativeCost.amount AS amount',
      'administrativeCost.lastTransaction AS last_transaction',
      'administrativeCost.transfer AS transfer',
      'user.email AS email',
      'user.id AS userId',
      'user.firstName AS first_name',
      'user.lastName AS last_name',
    ];

    const builder = createQueryBuilder()
      .from(InactivityAdministrativeCosts, 'administrativeCost')
      .leftJoin(User, 'user')
      .select(selection);

    if (userId != null) {
      builder.where(`user.id = ${userId}`);
    }

    builder.orderBy({ 'user.id': 'DESC' });

    return builder;
  }


  /**
   * Function for getting all users who are in range of the administrative costs
   * @param filter - Query filter to apply
   * @param pagination - Pagination to adhere to
   */
  public static async getAdministrativeCostUsers(
    filter: AdministrativeFilterParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedInactivityAdministrativeCostsResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      (await this.buildGetAdministrativeCostUsers(filter.userId)).limit(take).offset(skip).getRawMany(),
      (await this.buildGetAdministrativeCostUsers(filter.userId)).getCount(),
    ]);



  }



  /**
     * Function for checking all users who are in range of the administrative costs
     * @param filter - Query filter to apply
     * @param pagination - Pagination to adhere to
     */
  public static async checkAdministrativeCostUsers(
    filter: AdministrativeFilterParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedInactivityAdministrativeCostsResponse> {
    const { take, skip } = pagination;
    const balances = await BalanceService.getBalances({});

    const userIds = balances.records.map((u) => u.id);
    const transactionIds = balances.records.map((t) => t.lastTransactionId);
    const transferIds = balances.records.map((t) => t.lastTransferId);

    const [users, transactions, transfers] = await Promise.all([
      User.find({ where: { id: In(userIds) } }),
      Transaction.find({ where: { id: In(transactionIds) } }),
      Transfer.find({ where: { id: In(transferIds) } }),
    ]);



    return {
      _pagination: {
        take, skip, count: count,
      },
      records,
    };

  }
}