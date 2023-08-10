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
import User, { UserType } from '../entity/user/user';
import BalanceService from './balance-service';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import dinero, { Dinero, DineroObject } from 'dinero.js';
import {
  BaseFineHandoutEventResponse, FineHandoutEventResponse,
  FineResponse,
  PaginatedFineHandoutEventResponse,
  UserToFineResponse,
} from '../controller/response/debtor-response';
import FineHandoutEvent from '../entity/fine/fineHandoutEvent';
import Fine from '../entity/fine/fine';
import TransferService from './transfer-service';
import { DineroObjectResponse } from '../controller/response/dinero-response';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import UserFineGroup from '../entity/fine/userFineGroup';
import { PaginationParameters } from '../helpers/pagination';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import { getConnection } from 'typeorm';
import Transfer from '../entity/transactions/transfer';

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
  static asFineResponse(fine: Fine): FineResponse {
    return {
      id: fine.id,
      createdAt: fine.createdAt.toISOString(),
      updatedAt: fine.updatedAt.toISOString(),
      user: parseUserToBaseResponse(fine.userFineGroup.user, true),
      amount: {
        amount: fine.amount.getAmount(),
        precision: fine.amount.getPrecision(),
        currency: fine.amount.getCurrency(),
      },
    };
  }

  static asBaseFineHandoutEventResponse(e: FineHandoutEvent): BaseFineHandoutEventResponse {
    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      referenceDate: e.referenceDate.toISOString(),
    };
  }

  static asFineHandoutEventResponse(e: FineHandoutEvent): FineHandoutEventResponse {
    return {
      ...this.asBaseFineHandoutEventResponse(e),
      fines: e.fines.map((fine) => this.asFineResponse(fine)),
    };
  }

  /**
   * Get a list of all fine handout events in chronological order
   */
  public static async getFineHandoutEvents(pagination: PaginationParameters = {}): Promise<PaginatedFineHandoutEventResponse> {
    const { take, skip } = pagination;

    const events = await FineHandoutEvent.find({ take, skip });
    const count = await FineHandoutEvent.count();

    const records = events.map((e) => DebtorService.asBaseFineHandoutEventResponse(e));

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  /**
   * Return the fine handout event with the given id. Includes all its fines with the corresponding user
   */
  public static async getSingleFineHandoutEvent(id: number): Promise<FineHandoutEventResponse> {
    const fineHandoutEvent = await FineHandoutEvent.findOne({
      where: { id },
      relations: ['fines', 'fines.userFineGroup', 'fines.userFineGroup.user'],
      order: { createdAt: 'DESC' },
    });

    return DebtorService.asFineHandoutEventResponse(fineHandoutEvent);
  }

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
  }: HandOutFinesParams): Promise<FineHandoutEventResponse> {
    const previousFineGroup = (await FineHandoutEvent.find({
      order: { id: 'desc' },
      relations: ['fines', 'fines.userFineGroup'],
      take: 1,
    }))[0];

    const date = referenceDate || previousFineGroup?.createdAt || new Date();

    const balances = await BalanceService.getBalances({
      date,
      ids: userIds,
    });

    const { fines: fines1, fineHandoutEvent: fineHandoutEvent1 } = await getConnection().transaction(async (manager) => {
      // Create a new fine group to "connect" all these fines
      const fineHandoutEvent = Object.assign(new FineHandoutEvent(), { referenceDate: date });
      await manager.save(fineHandoutEvent);

      // Create and save the fine information
      let fines: Fine[] = await Promise.all(balances.records.map(async (b) => {
        const previousFine = previousFineGroup?.fines.find((fine) => fine.userFineGroup.userId === b.id);
        const user = await manager.findOne(User, { where: { id: b.id }, relations: ['currentFines', 'currentFines.user'] });
        const amount = calculateFine(b.amount);

        let userFineGroup = user.currentFines;
        if (userFineGroup == undefined) {
          userFineGroup = Object.assign(new UserFineGroup(), {
            userId: b.id,
            user: user,
          });
          userFineGroup = await userFineGroup.save();
          if (amount.getAmount() > 0) {
            user.currentFines = userFineGroup;
            await manager.save(user);
          }
        }

        const transfer = await TransferService.createTransfer({
          amount: amount.toObject(),
          fromId: user.id,
          description: `Fine for balance of ${dinero({ amount: b.amount.amount }).toFormat()} on ${date.toLocaleDateString()}.`,
          toId: undefined,
        });

        return Object.assign(new Fine(), {
          fineHandoutEvent,
          userFineGroup,
          amount: calculateFine(b.amount),
          previousFine,
          transfer,
        });
      }));
      return { fines: await manager.save(fines), fineHandoutEvent };
    });

    return {
      id: fineHandoutEvent1.id,
      createdAt: fineHandoutEvent1.createdAt.toISOString(),
      updatedAt: fineHandoutEvent1.updatedAt.toISOString(),
      referenceDate: fineHandoutEvent1.referenceDate.toISOString(),
      fines: fines1.map((f) => this.asFineResponse(f)),
    };
  }

  /**
   * Delete a fine with its transfer, but keep the FineHandoutEvent (they can be empty)
   * @param id
   */
  public static async deleteFine(id: number): Promise<void> {
    const fine = await Fine.findOne({ where: { id }, relations: ['transfer', 'userFineGroup', 'userFineGroup.fines'] });
    if (fine == null) return;

    const { transfer, userFineGroup } = fine;

    await Fine.remove(fine);
    await Transfer.remove(transfer);
    if (userFineGroup.fines.length === 1) await UserFineGroup.remove(userFineGroup);
  }
}
