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
 */

import User, { UserType } from '../entity/user/user';
import BalanceService from './balance-service';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import dinero, { Dinero, DineroObject } from 'dinero.js';
import {
  BaseFineHandoutEventResponse,
  FineHandoutEventResponse, FineReport, FineReportResponse, FineResponse,
  PaginatedFineHandoutEventResponse, UserFineGroupResponse,
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
import Mailer from '../mailer';
import UserGotFined from '../mailer/messages/user-got-fined';
import MailMessage from '../mailer/mail-message';
import UserWillGetFined from '../mailer/messages/user-will-get-fined';

export interface CalculateFinesParams {
  userTypes?: UserType[];
  userIds?: number[];
  referenceDates: Date[];
}

export interface HandOutFinesParams {
  referenceDate: Date;
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
      user: parseUserToBaseResponse(fine.userFineGroup.user, false),
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
      createdBy: parseUserToBaseResponse(e.createdBy, false),
    };
  }

  static asFineHandoutEventResponse(e: FineHandoutEvent): FineHandoutEventResponse {
    return {
      ...this.asBaseFineHandoutEventResponse(e),
      fines: e.fines.map((fine) => this.asFineResponse(fine)),
    };
  }

  static asUserFineGroupResponse(e: UserFineGroup): UserFineGroupResponse {
    return {
      fines: e.fines.map((f) => this.asFineResponse(f)),
    };
  }

  /**
   * Get a list of all fine handout events in chronological order
   */
  public static async getFineHandoutEvents(pagination: PaginationParameters = {}): Promise<PaginatedFineHandoutEventResponse> {
    const { take, skip } = pagination;

    const events = await FineHandoutEvent.find({ take, skip, order: {
      createdAt: 'DESC',
    } });
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
   * @param userIds List of all user IDs fines should be calculated for
   * @param referenceDates Dates at which a user needs to have a negative balance. The first
   * date will be used to determine the size of the fine
   */
  public static async calculateFinesOnDate({ userTypes, userIds, referenceDates }: CalculateFinesParams): Promise<UserToFineResponse[]> {
    if (referenceDates.length === 0) throw new Error('No reference dates given.');

    const balances = await Promise.all(referenceDates.map((date) => BalanceService.getBalances({
      maxBalance: DineroTransformer.Instance.from(-500),
      date,
      userTypes,
      ids: userIds,
    })));

    const [debtorsOnReferenceDate, ...debtors] = balances;
    const userBalancesToFine = debtorsOnReferenceDate.records
      .filter((d1) => debtors.every((b) => b.records
        .some((d2) => d1.id === d2.id)));

    return userBalancesToFine.map((u) => {
      const fine = calculateFine(u.amount);
      return {
        id: u.id,
        fineAmount: {
          amount: fine.getAmount(),
          currency: fine.getCurrency(),
          precision: fine.getPrecision(),
        },
        balances: balances.map((balance) => balance.records.find((b) => b.id === u.id)),
      };
    });
  }

  /**
   * Write fines in a single database transaction to database for all given user ids.
   * @param referenceDate Date to base fines on
   * @param userIds Ids of all users to fine
   * @param createdBy User handing out fines
   */
  public static async handOutFines({
    referenceDate, userIds,
  }: HandOutFinesParams, createdBy: User): Promise<FineHandoutEventResponse> {
    const previousFineGroup = (await FineHandoutEvent.find({
      order: { id: 'desc' },
      relations: ['fines', 'fines.userFineGroup'],
      take: 1,
    }))[0];

    const balances = await BalanceService.getBalances({
      date: referenceDate,
      ids: userIds,
    });

    // NOTE: executed in single transaction
    const { fines: fines1, fineHandoutEvent: fineHandoutEvent1, emails: emails1 } = await getConnection().transaction(async (manager) => {
      // Create a new fine group to "connect" all these fines
      const fineHandoutEvent = Object.assign(new FineHandoutEvent(), {
        referenceDate,
        createdBy,
      });
      await manager.save(fineHandoutEvent);

      const emails: { user: User, email: MailMessage<any> }[] = [];

      // Create and save the fine information
      let fines: Fine[] = await Promise.all(balances.records.map(async (b) => {
        const previousFine = previousFineGroup?.fines.find((fine) => fine.userFineGroup.userId === b.id);
        const user = await manager.findOne(User, { where: { id: b.id }, relations: ['currentFines', 'currentFines.user', 'currentFines.fines'] });
        const amount = calculateFine(b.amount);

        let userFineGroup = user.currentFines;
        if (userFineGroup == undefined) {
          userFineGroup = Object.assign(new UserFineGroup(), {
            userId: b.id,
            user: user,
            fines: [],
          });
          userFineGroup = await userFineGroup.save();
          if (amount.getAmount() > 0) {
            user.currentFines = userFineGroup;
            await manager.save(user);
          }
        }

        const transfer = await (new TransferService(manager)).createTransfer({
          amount: amount.toObject(),
          fromId: user.id,
          description: `Fine for balance of ${dinero({ amount: b.amount.amount }).toFormat()} on ${referenceDate.toLocaleDateString()}.`,
          toId: undefined,
        });

        emails.push({ user, email: new UserGotFined({
          fine: amount,
          balance: DineroTransformer.Instance.from(b.amount.amount),
          referenceDate,
          totalFine: userFineGroup.fines.reduce((sum, f) => sum.add(f.amount), dinero({ amount :0 })).add(amount),
        }) });

        return Object.assign(new Fine(), {
          fineHandoutEvent,
          userFineGroup,
          amount: calculateFine(b.amount),
          previousFine,
          transfer,
        });
      }));
      return { fines: await manager.save(fines), fineHandoutEvent, emails };
    });

    emails1.forEach(({ user, email }) => Mailer.getInstance().send(user, email));

    return {
      id: fineHandoutEvent1.id,
      createdAt: fineHandoutEvent1.createdAt.toISOString(),
      updatedAt: fineHandoutEvent1.updatedAt.toISOString(),
      referenceDate: fineHandoutEvent1.referenceDate.toISOString(),
      createdBy: parseUserToBaseResponse(fineHandoutEvent1.createdBy, false),
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
    if (userFineGroup.fines.length === 1) {
      await UserFineGroup.remove(userFineGroup);
    }
    if (userFineGroup.fines.length > 1) {
      // If user does not have a debt anymore, remove the UserFineGroup reference
      const newBalance = await BalanceService.getBalance(userFineGroup.userId);
      if (newBalance.amount.amount < 0) return;
      await User.update(userFineGroup.userId, { currentFines: null });
    }
  }

  /**
   * Waive a user's unpaid fines by creating a transfer nullifying them
   * @param userId
   */
  public static async waiveFines(userId: number): Promise<UserFineGroup> {
    const user = await User.findOne({
      where: { id: userId },
      relations: ['currentFines', 'currentFines.fines'],
    });
    if (user == null) throw new Error(`User with ID ${userId} does not exist`);
    if (user.currentFines == null) return;

    const userFineGroup = user.currentFines;
    const amount = userFineGroup.fines.reduce((sum, f) => sum.add(f.amount), dinero({ amount: 0 }));

    // Create the waived transfer
    userFineGroup.waivedTransfer = await new TransferService().createTransfer({
      amount: amount.toObject(),
      toId: user.id,
      description: 'Waived fines',
      fromId: undefined,
    });
    await userFineGroup.save();

    // Remove the fine from the user. This must be done manually,
    // because the user can still have a negative balance when the
    // fine is waived.
    user.currentFines = null;
    await user.save();
  }

  /**
   * Send an email to all users with the given ID, notifying them that they will get fined a certain amount. The date
   * the fine and email will be based on is the reference date, the date of the last fine handout event or the current
   * date (in this order if one is undefined). However, users only receive an email when they have a debt both on the
   * reference date and now.
   * If a user has no debt, they will be skipped and not sent an email.
   * @param referenceDate
   * @param userIds
   */
  public static async sendFineWarnings({
    referenceDate, userIds,
  }: HandOutFinesParams): Promise<void> {
    const fines = await this.calculateFinesOnDate({ userIds, referenceDates: [referenceDate] });

    await Promise.all(fines.map(async (f) => {
      const user = await User.findOne({ where: { id: f.id } });
      const balance = f.balances[0];
      if (balance == null) throw new Error('Missing balance');
      return Mailer.getInstance().send(user, new UserWillGetFined({
        referenceDate: referenceDate,
        fine: dinero(f.fineAmount as any),
        balance: dinero(balance.amount as any),
      }));
    }));
  }

  /**
   * Get a report of all fines
   * @param fromDate
   * @param toDate
   */
  public static async getFineReport(fromDate: Date, toDate: Date): Promise<FineReport> {
    let handedOut = dinero({ amount: 0 });
    let waivedAmount = dinero({ amount: 0 });
    const count = {
      count: 0,
      waivedCount: 0,
    };

    // Get all transfers that have a fine or waived fine
    const transfers = await Transfer.find({
      relations: ['fine', 'fine.transfer',  'waivedFines', 'waivedFines.waivedTransfer'],
      where: [{ fine: true }, { waivedFines: true }],
    });

    transfers.forEach((transfer) => {
      if (transfer.fine != null && transfer.waivedFines != null) throw new Error('Transfer has both fine and waived fine');
      if (transfer.fine != null) {
        handedOut = handedOut.add(transfer.fine.amount);
        count.count++;
      }
      if (transfer.waivedFines != null) {
        waivedAmount = waivedAmount.add(transfer.amountInclVat);
        count.waivedCount++;
      }
    });

    return {
      fromDate,
      toDate,
      ...count,
      handedOut,
      waivedAmount,
    };
  }

  public static fineReportToResponse(report: FineReport): FineReportResponse {
    return {
      fromDate: report.fromDate.toISOString(),
      toDate: report.toDate.toISOString(),
      count: report.count,
      handedOut: report.handedOut.toObject(),
      waivedCount: report.waivedCount,
      waived: report.waivedAmount.toObject(),
    };
  }

}
