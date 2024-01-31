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
import { PaginatedUserResponse } from '../controller/response/user-response';
import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import User from '../entity/user/user';
import Transaction from '../entity/transactions/transaction';
import Balance from '../entity/transactions/balance';
import Bindings from '../helpers/bindings';

/**
 * Parameters for type of administrative cost, notification or fine
 */

export interface AdministrativeFilterParameters {
  notificiation?: boolean,
  fine?: boolean,
}

export default class AdministrativeCostService {

  private static async buildGetAdministrativeCostUsers(filters: AdministrativeFilterParameters = {})
    :Promise<SelectQueryBuilder<User>> {
    const selection = [
      'user.id AS id',
      'user.firstName AS firstName',
      'user.lastName AS lastName',
      'user.email AS email',
    ];

    const date = new Date();

    const builder = createQueryBuilder()
      .from(User, 'user')
      .innerJoin(
        Balance,
        'balance',
        'balance.userId = user.id',
      )
      .innerJoin(
        Transaction,
        'transaction',
        'transaction.fromID = user.id AND balance.lastTransactionId = transaction.id',
      )
      .select(selection);


    if (filters.notificiation) {
      builder.where(`((JulianDay(${date})-JulianDay(transaction.createdAt))/365.25) >= 2`);
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
    filters: AdministrativeFilterParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedUserResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      (await this.buildGetAdministrativeCostUsers(filters)).limit(take).offset(skip).getRawMany(),
      (await this.buildGetAdministrativeCostUsers(filters)).getCount(),
    ]);

    const records = results[0].map((u) => Bindings.Users.parseToResponse(u, false));

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };

  }
}