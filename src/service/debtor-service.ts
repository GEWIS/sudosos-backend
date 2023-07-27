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
import { UserType } from '../entity/user/user';
import BalanceService from './balance-service';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import dinero, { Dinero, DineroObject } from 'dinero.js';
import { UserToFineResponse } from '../controller/response/fine-response';
import FineHandoutEvent from '../entity/fine/fineHandoutEvent';
import Fine from '../entity/fine/fine';
import TransferService from './transfer-service';
import { DineroObjectResponse } from '../controller/response/dinero-response';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import UserFineGroup from '../entity/fine/userFineGroup';

export interface CalculateFinesParams {
  userTypes?: UserType[];
  referenceDate?: Date;
}

export interface HandOutFinesParams {
  referenceDate?: Date;
  userIds: number[];
}

/**
 * Calculate the fine given a (negative) balance between [0, 5.00] euros
 * @param balance
 */
function calculateFine(balance: DineroObject | DineroObjectResponse | DineroObjectRequest): Dinero {
  return DineroTransformer.Instance.from(
    Math.max(
      Math.min(
      // Divide by 5, round to euros (/100, then floor), then multiply by 100 again
        Math.floor(-balance.amount / 500) * 100,
        500,
      ),
      0,
    ),
  );
}

export default class DebtorService {
  /**
   * Return all users that had at most -5 euros balance both now and on the reference date
   * For all these users, also return their fine based on the reference date.
   * @param userTypes List of all user types fines should be calculated for
   * @param referenceDate Date to base fines on. If undefined, use now.
   */
  public static async calculateFinesOnDate({ userTypes, referenceDate }: CalculateFinesParams): Promise<UserToFineResponse[]> {
    const debtorsOnReferenceDate = await BalanceService.getBalances({
      maxBalance: DineroTransformer.Instance.from(-500),
      date: referenceDate,
      userTypes,
    });

    const debtorsNow = await BalanceService.getBalances({
      maxBalance: DineroTransformer.Instance.from(-500),
      userTypes,
    });
    const debtorsNowIds = debtorsNow.records.map((b) => b.id);

    const userBalancesToFine = debtorsOnReferenceDate.records.filter((b) => debtorsNowIds.includes(b.id));

    return userBalancesToFine.map((u) => {
      const fine = calculateFine(u.amount);
      return {
        id: u.id,
        amount: {
          amount: fine.getAmount(),
          currency: fine.getCurrency(),
          precision: fine.getPrecision(),
        },
      };
    });
  }

  /**
   * Write fines to database for all given user ids.
   * @param referenceDate Date to base fines on. If undefined, the date of the previous fines will be used. If this is the first fine, use now.
   * @param userIds Ids of all users to fine
   */
  public static async handOutFines({
    referenceDate, userIds,
  }: HandOutFinesParams): Promise<Fine[]> {
    const previousFineGroup = (await FineHandoutEvent.find({
      order: { id: 'desc' },
      relations: ['fines', 'fines.userFineCollection'],
      take: 1,
    }))[0];

    const date = referenceDate || previousFineGroup?.createdAt || new Date();

    const balances = await BalanceService.getBalances({
      date,
      ids: userIds,
    });

    // Create a new fine group to "connect" all these fines
    const fineGroup = Object.assign(new FineHandoutEvent(), { referenceDate: date });
    await fineGroup.save();

    // Create and save the fine information
    let fines: Fine[] = await Promise.all(balances.records.map(async (b) => {
      const previousFine = previousFineGroup?.fines.find((fine) => fine.userFineCollection.userId === b.id);

      let userFineCollection: UserFineGroup;
      if (previousFine == undefined) {
        userFineCollection = Object.assign(new UserFineGroup(), {
          userId: b.id,
        });
        userFineCollection = await userFineCollection.save();
      } else {
        userFineCollection = previousFine.userFineCollection;
      }

      return Object.assign(new Fine(), {
        fineGroup,
        userFineCollection,
        amount: calculateFine(b.amount),
        previousFine,
      });
    }));
    await Fine.save(fines);

    // Create a fine transfer
    fines = await Promise.all(fines.map(async (fine, i): Promise<Fine> => {
      fine.transfer = await TransferService.createTransfer({
        amount: {
          amount: fine.amount.getAmount(),
          precision: fine.amount.getPrecision(),
          currency: fine.amount.getCurrency(),
        },
        fromId: fine.userFineCollection.userId,
        description: `Fine for balance of ${dinero({ amount: balances.records[i].amount.amount }).toFormat()} on ${date.toLocaleDateString()}.`,
        toId: undefined,
      });
      return fine.save();
    }));

    return fines;
  }
}
