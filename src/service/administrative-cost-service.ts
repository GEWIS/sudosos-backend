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
import BalanceService, { GetBalanceParameters } from './balance-service';
import Transaction from '../entity/transactions/transaction';
import Transfer from '../entity/transactions/transfer';
import User from '../entity/user/user';
import InactivityAdministrativeCostsParams from '../controller/request/inactivity-administrative-costs-request';
import TransferService from './transfer-service';
import TransferRequest from '../controller/request/transfer-request';
import DineroTransformer from '../entity/transformer/dinero-transformer';



/**
 * Parameters for type of administrative cost, notification or fine
 */

export interface InactivityAdministrativeCostFilterParameters {
  /**
   * Filter based on userId
   */
  userId?: number,

  /**
   * Filter based on amount of years
   */
  yearDifference?: number,
}

export default class AdministrativeCostService {

  private static yearCheck(date: Date, maxDifference: number) : boolean {

    const difference = new Date(Date.now() - date.getTime());

    const diff = difference.getFullYear() - 1970;

    if ((difference.getFullYear() - 1970) >= maxDifference) {
      return true;
    } else return false;
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

  // /**
  //  * Checks all users for their inactivity
  //  * @param filters - The filter parameters
  //  */
  // public static async checkInactivityAdministrativeCost(filters: InactivityAdministrativeCostFilterParameters = {})
  //   : Promise<User[]> {
  //
  //   const getBalanceParameters: GetBalanceParameters = {};
  //
  //   const [users, lastTransactions, lastTransfer]: [User[], Transaction[], Transfer[]] = [[], [], []];
  //
  //   const balances = (await BalanceService.getBalances(getBalanceParameters)).records;
  //
  //   for (let i = 0; i < balances.length; i += 1) {
  //     const user = await User.findOne({ where: { id: balances[i].id } });
  //     const transaction = await Transaction.findOne({ where: { id: balances[i].lastTransactionId } });
  //     const transfer = await Transfer.findOne({ where: { id: balances[i].lastTransferId } });
  //
  //     users.push(user);
  //     lastTransactions.push(transaction);
  //     lastTransfer.push(transfer);
  //   }
  //
  //   const inactiveUsers: User[] = [];
  //
  //   for (let i = 0; i < users.length; i += 1) {
  //     if (lastTransactions[i] != null && lastTransfer[i] != null) {
  //       if (this.yearCheck(lastTransactions[i].updatedAt, filters.yearDifference) && this.yearCheck(lastTransfer[i].updatedAt, filters.yearDifference)) {
  //         inactiveUsers.push(users[i]);
  //         continue;
  //       }
  //     } else if (lastTransactions[i] != null && lastTransfer[i] == null) {
  //       if (this.yearCheck(lastTransactions[i].updatedAt, filters.yearDifference)) {
  //         inactiveUsers.push(users[i]);
  //         continue;
  //       }
  //     } else if (lastTransactions[i] == null && lastTransfer[i] != null) {
  //       if (this.yearCheck(lastTransfer[i].updatedAt, filters.yearDifference)) {
  //         inactiveUsers.push(users[i]);
  //         continue;
  //       }
  //     }
  //   }
  //
  //   return inactiveUsers;
  // }

  /**
   * Creates an inactivity administrative cost for users
   * @param inactivityAdministrativeCost - The new inactivity administrative costs parameters
   */
  public static async createInactivityAdministrativeCost(inactivityAdministrativeCost: InactivityAdministrativeCostsParams)
    : Promise<InactivityAdministrativeCosts> {
    const from = await User.findOne( { where: { id: inactivityAdministrativeCost.fromId } });

    if (!from) return undefined;

    const balance = await BalanceService.getBalance(from.id);
    const amount = (balance.amount.amount > 10) ? 10 : balance.amount.amount;

    const transfer: TransferRequest = {
      amount: {
        amount: amount,
        precision: 2,
        currency: 'EUR',
      },
      description: '',
      fromId: inactivityAdministrativeCost.fromId,
      toId: undefined,
    };

    const createdInactivityAdministrativeCost = Object.assign(new InactivityAdministrativeCosts(), {
      from: from,
      amount: DineroTransformer.Instance.from(amount),
      lastTransaction: inactivityAdministrativeCost.lastTransaction,
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