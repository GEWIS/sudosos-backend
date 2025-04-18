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

/**
 * This is the module page of the debtor-service.
 *
 * @module debtors
 */

import User, { UserType } from '../entity/user/user';
import BalanceService from './balance-service';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import dinero, { Dinero, DineroObject } from 'dinero.js';
import {
  BaseFineHandoutEventResponse,
  FineHandoutEventResponse, FineResponse,
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
import Transfer from '../entity/transactions/transfer';
import Mailer from '../mailer';
import UserGotFined from '../mailer/messages/user-got-fined';
import MailMessage from '../mailer/mail-message';
import UserWillGetFined from '../mailer/messages/user-will-get-fined';
import { FineReport } from '../entity/report/fine-report';
import WithManager from '../database/with-manager';
import QueryFilter from '../helpers/query-filter';

export interface CalculateFinesParams {
  userTypes?: UserType[];
  userIds?: number[];
  referenceDates: Date[];
}

export interface HandOutFinesParams {
  referenceDate: Date;
  userIds: number[];
}

export interface WaiveFinesParams {
  amount: DineroObjectRequest;
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

export default class DebtorService extends WithManager {
  static asFineResponse(fine: Fine): FineResponse {
    return {
      id: fine.id,
      createdAt: fine.createdAt.toISOString(),
      updatedAt: fine.updatedAt.toISOString(),
      user: parseUserToBaseResponse(fine.userFineGroup.user, false),
      amount: fine.amount.toObject(),
    };
  }

  static asBaseFineHandoutEventResponse(e: FineHandoutEvent): BaseFineHandoutEventResponse {
    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      referenceDate: e.referenceDate.toISOString(),
      createdBy: parseUserToBaseResponse(e.createdBy, false),
      count: e.fines ? e.fines.length : 0,
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
  public async getFineHandoutEvents(pagination: PaginationParameters = {}): Promise<PaginatedFineHandoutEventResponse> {
    const { take, skip } = pagination;

    const events = await this.manager.find(FineHandoutEvent, { take, skip, order: {
      createdAt: 'DESC',
    } });
    const count = await this.manager.count(FineHandoutEvent);

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
  public async getSingleFineHandoutEvent(id: number): Promise<FineHandoutEventResponse> {
    const fineHandoutEvent = await this.manager.findOne(FineHandoutEvent, {
      where: { id },
      relations: { fines: { userFineGroup: { user: true } } },
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
  public async calculateFinesOnDate({ userTypes, userIds, referenceDates }: CalculateFinesParams): Promise<UserToFineResponse[]> {
    if (referenceDates.length === 0) throw new Error('No reference dates given.');

    const balances = await Promise.all(referenceDates.map((date) => new BalanceService().getBalances({
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
        fineAmount: fine.toObject(),
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
  public async handOutFines({
    referenceDate, userIds,
  }: HandOutFinesParams, createdBy: User): Promise<FineHandoutEventResponse> {
    const previousFineGroup = (await this.manager.find(FineHandoutEvent, {
      order: { id: 'desc' },
      relations: ['fines', 'fines.userFineGroup'],
      take: 1,
    }))[0];

    const balances = await new BalanceService(this.manager).getBalances({
      date: referenceDate,
      ids: userIds,
    });

    // NOTE: executed in single transaction
    const { fines: fines1, fineHandoutEvent: fineHandoutEvent1, emails: emails1 } = await this.manager.transaction(async (manager) => {
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
          userFineGroup = await manager.save(UserFineGroup, userFineGroup);
          if (amount.getAmount() > 0) {
            user.currentFines = userFineGroup;
            await manager.save(User, user);
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
      fines: fines1.map((f) => DebtorService.asFineResponse(f)),
      count: fines1.length,
    };
  }

  /**
   * Delete a fine with its transfer, but keep the FineHandoutEvent (they can be empty)
   * @param id
   */
  public async deleteFine(id: number): Promise<void> {
    const fine = await this.manager.findOne(Fine, { where: { id }, relations: ['transfer', 'userFineGroup', 'userFineGroup.fines'] });
    if (fine == null) return;

    const { transfer, userFineGroup } = fine;

    await this.manager.remove(Fine, fine);
    await this.manager.remove(Transfer, transfer);
    if (userFineGroup.fines.length === 1) {
      await this.manager.remove(UserFineGroup, userFineGroup);
    }
    if (userFineGroup.fines.length > 1) {
      // If user does not have a debt anymore, remove the UserFineGroup reference
      const newBalance = await new BalanceService().getBalance(userFineGroup.userId);
      if (newBalance.amount.amount < 0) return;
      await this.manager.update(User, userFineGroup.userId, { currentFines: null });
    }
  }

  /**
   * Waive a user's unpaid fines (partially) by creating a transfer which puts some money
   * back into the user's account. If the user's fines were already (partially) waived, the
   * existing transfer waiving the fines will be replaced by a new transfer.
   * @param userId User to waive fines for
   * @param params
   */
  public async waiveFines(userId: number, params: WaiveFinesParams): Promise<UserFineGroup> {
    const user: User = await this.manager.findOne(User, {
      where: { id: userId },
      relations: { currentFines: { fines: true, waivedTransfer: true } },
    });
    if (user == null) throw new Error(`User with ID ${userId} does not exist`);
    if (user.currentFines == null) return;

    const userFineGroup = user.currentFines;
    const amount = userFineGroup.fines.reduce((sum, f) => sum.add(f.amount), dinero({ amount: 0 }));

    if (params.amount.amount <= 0) throw new Error('Amount to waive cannot be zero or negative.');
    if (params.amount.amount > amount.getAmount()) throw new Error('Amount to waive cannot be greater than the total amount of fines.');

    // If the fine is already partially waived, delete the old transfer
    if (userFineGroup.waivedTransfer) {
      await this.manager.remove(Transfer, userFineGroup.waivedTransfer);
    }

    // Create the transfer for the waived amount
    userFineGroup.waivedTransfer = await new TransferService(this.manager).createTransfer({
      amount: params.amount,
      toId: user.id,
      description: 'Waived fines',
      fromId: undefined,
    });
    await this.manager.save(UserFineGroup, userFineGroup);

    if (params.amount.amount === amount.getAmount()) {
      // Remove the fine from the user when the total amount is waived.
      // This must be done manually, because the user can still have a
      // negative balance when the fine is waived.
      await this.manager.update(User, { id: user.id }, { currentFines: null });
    }

    return userFineGroup;
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
  public async sendFineWarnings({
    referenceDate, userIds,
  }: HandOutFinesParams): Promise<void> {
    const fines = await this.calculateFinesOnDate({ userIds, referenceDates: [referenceDate] });

    await Promise.all(fines.map(async (f) => {
      const user = await this.manager.findOne(User, { where: { id: f.id } });
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
  public async getFineReport(fromDate: Date, toDate: Date): Promise<FineReport> {
    let handedOut = dinero({ amount: 0 });
    let waivedAmount = dinero({ amount: 0 });
    const count = {
      count: 0,
      waivedCount: 0,
    };

    // Get all transfers that have a fine or waived fine
    const transfers = await this.manager.find(Transfer, {
      relations: { fine: { transfer: true }, waivedFines: { waivedTransfer: true } },
      where: [
        { fine: true, createdAt: QueryFilter.createFilterWhereDate(fromDate, toDate) },
        { waivedFines: true, createdAt: QueryFilter.createFilterWhereDate(fromDate, toDate) },
      ],
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

    return new FineReport({
      fromDate,
      toDate,
      ...count,
      handedOut,
      waivedAmount,
    });
  }
}
