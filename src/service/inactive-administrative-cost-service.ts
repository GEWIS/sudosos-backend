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

import WithManager from '../database/with-manager';
import { FindManyOptions, FindOptionsRelations, In } from 'typeorm';
import InactiveAdministrativeCost from '../entity/transactions/inactive-administrative-cost';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User, { EligibleInactiveUsers } from '../entity/user/user';
import BalanceService from './balance-service';
import TransferService from './transfer-service';
import {
  CreateInactiveAdministrativeCostRequest,
  HandoutInactiveAdministrativeCostsRequest,
} from '../controller/request/inactive-administrative-cost-request';
import TransferRequest from '../controller/request/transfer-request';
import dinero from 'dinero.js';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import Transfer from '../entity/transactions/transfer';
import Transaction from '../entity/transactions/transaction';
import InactiveAdministrativeCostNotification from '../mailer/messages/inactive-administrative-cost-notification';
import Mailer from '../mailer';
import UserGotInactiveAdministrativeCost from '../mailer/messages/user-got-inactive-administrative-cost';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asNumber } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import {
  BaseInactiveAdministrativeCostResponse,
  UserToInactiveAdministrativeCostResponse,
} from '../controller/response/inactive-administrative-cost-response';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import ServerSettingsStore from '../server-settings/server-settings-store';
import { ISettings } from '../entity/server-setting';


export interface InactiveAdministrativeCostFilterParameters {
  /**
   * Filter based on user id
   */
  fromId?: number;

  /**
   * Filter based on inactive administrative cost id
   */
  inactiveAdministrativeCostId?: number;

  /**
   * Filter on notification or fine
   */
  notification?: boolean;
}

export function parseInactiveAdministrativeCostFilterParameters(req: RequestWithToken): InactiveAdministrativeCostFilterParameters {
  return {
    fromId: asNumber(req.query.fromId),
    inactiveAdministrativeCostId: asNumber(req.query.inactiveAdministrativeCostId),
    notification: asBoolean(req.query.notification),
  };
}

export default class InactiveAdministrativeCostService extends WithManager {

  // Calculate the year difference between 2 dates.
  private static yearDifference(date: Date) : number {
    const dateDiff = (new Date().getTime() - date.getTime());
    const ageDate = new Date(dateDiff);

    return Math.abs(ageDate.getUTCFullYear() - 1970);
  }

  private static getAdministrativeCostValue(): number {
    return ServerSettingsStore.getInstance().getSetting('administrativeCostValue') as ISettings['administrativeCostValue'];
  }

  private async lastTransferQuery(userId: number): Promise<Transfer> {
    return Transfer.getRepository()
      .createQueryBuilder('transfer')
      .select('MAX(transfer.createdAt) as createdAt')
      .where('transfer.inactiveAdministrativeCost = NULL')
      .andWhere(`transfer.fromId = ${userId}`)
      .leftJoin(InactiveAdministrativeCost, 'inactiveAdministrativeCost', 'inactiveAdministrativeCost.transferId = inactiveAdministrativeCost.id')
      .where('inactiveAdministrativeCost.id is NULL')
      .getOne();
  }

  private async lastTransactionQuery(userId: number): Promise<Transaction> {
    return Transaction.getRepository()
      .createQueryBuilder('transaction')
      .select('MAX(createdAt) as createdAt')
      .where(`transaction.from.id = ${userId}`)
      .getOne();
  }

  public static toArrayResponse(inactiveAdministrativeCosts: InactiveAdministrativeCost[]): BaseInactiveAdministrativeCostResponse[] {
    return inactiveAdministrativeCosts.map(inactiveAdministrativeCost => InactiveAdministrativeCostService.asInactiveAdministrativeCostResponse(inactiveAdministrativeCost));
  }

  /**
   * Parses an InactiveAdministrativeCost Object to a BaseInactiveAdministrativeCostResponse
   * @param inactiveAdministrativeCost - The InactiveAdministrativeCost to parse
   */
  public static asInactiveAdministrativeCostResponse(inactiveAdministrativeCost: InactiveAdministrativeCost): BaseInactiveAdministrativeCostResponse {
    return {
      id: inactiveAdministrativeCost.id,
      createdAt: inactiveAdministrativeCost.createdAt.toISOString(),
      updatedAt: inactiveAdministrativeCost.updatedAt.toISOString(),
      from: parseUserToBaseResponse(inactiveAdministrativeCost.from, false),
      amount: inactiveAdministrativeCost.amount.toObject(),
      transfer: inactiveAdministrativeCost.transfer ? TransferService.asTransferResponse(inactiveAdministrativeCost.transfer) : undefined,
    };
  }

  /**
   * Checks which users are eligible for either a notification or a fine.
   * @param params
   */
  public async checkInactiveUsers(params: InactiveAdministrativeCostFilterParameters)
    : Promise<UserToInactiveAdministrativeCostResponse[]> {
    const { notification } = params;
    const differenceDate = notification ? 2 : 3;

    const users = await User.find({
      where: { type: In(EligibleInactiveUsers) },
    });
    const eligibleUsers: UserToInactiveAdministrativeCostResponse[] = [];

    // go through all users and get their last transfer and transaction
    for (const user of users) {
      if (notification && user.inactiveNotificationSend) continue;

      let isNotEligible = false;

      const lastTransfer = await this.lastTransferQuery(user.id);
      const lastTransaction = await this.lastTransactionQuery(user.id);

      if (lastTransfer !== null) if (InactiveAdministrativeCostService.yearDifference(lastTransfer.createdAt) < differenceDate) {
        isNotEligible = true;
      }
      if (lastTransaction !== null) if (InactiveAdministrativeCostService.yearDifference(lastTransaction.createdAt) < differenceDate) {
        isNotEligible = true;
      }

      if (!isNotEligible) {
        const response: UserToInactiveAdministrativeCostResponse = { userId: user.id };
        eligibleUsers.push(response);
      }
    }

    return eligibleUsers;
  }

  /**
   * Deletes the given InactiveAdministrativeCost and creates an undo transfer
   * @param inactiveAdministrativeCostId
   */
  public async deleteInactiveAdministrativeCost(inactiveAdministrativeCostId: number)
    : Promise<InactiveAdministrativeCost | undefined> {
    // Find base inactive administrative cost entity.
    const inactiveAdministrativeCost = await this.manager.findOne(InactiveAdministrativeCost, { ...InactiveAdministrativeCostService.getOptions({ inactiveAdministrativeCostId }) });
    if (!inactiveAdministrativeCost) return undefined;

    // Get amount from transfer
    const amount: DineroObjectRequest = inactiveAdministrativeCost.transfer.amountInclVat.toObject();

    // We create an undo transfer that sends the money back to the person.
    const undoTransfer: TransferRequest = {
      amount,
      description: 'Deletion of InactiveAdministrativeCost',
      fromId: 0,
      toId: inactiveAdministrativeCost.fromId,
    };

    // Save new transfer and delete the administrative cost
    await new TransferService(this.manager).postTransfer(undoTransfer).then(async (response) => {
      const transfer = await Transfer.findOne({ where: { id: response.id } });
      if (!transfer) throw new Error('Transfer not found during deletion of inactive administrative cost, aborting');
      inactiveAdministrativeCost.creditTransfer = transfer;
    });
    await this.manager.save(InactiveAdministrativeCost, inactiveAdministrativeCost);

    const options = InactiveAdministrativeCostService.getOptions({ inactiveAdministrativeCostId: inactiveAdministrativeCost.id });
    return this.manager.findOne(InactiveAdministrativeCost, options);
  }

  /**
   * Creates an InactiveAdministrativeCost from an InactiveAdministrativeCostRequest
   * @param inactiveAdministrativeCostRequest - The InactiveAdministrativeCost request to create
   */
  public async createInactiveAdministrativeCost(inactiveAdministrativeCostRequest: CreateInactiveAdministrativeCostRequest)
    : Promise<InactiveAdministrativeCost> {
    const { forId } = inactiveAdministrativeCostRequest;

    // Calculate reduction amount
    const user = await this.manager.findOne(User, { where: { id: forId } });
    const userBalance = await new BalanceService(this.manager).getBalance(forId);

    const administrativeCostValue = InactiveAdministrativeCostService.getAdministrativeCostValue();

    // Ensure the deduction does not exceed the user's balance and is never negative
    const monetaryAmount = Math.min(userBalance.amount.amount, administrativeCostValue);

    const amount: DineroObjectRequest = {
      amount: monetaryAmount,
      currency: 'EUR',
      precision: 2,
    };

    // Create transfer request and create the linked transfer
    const transferRequest: TransferRequest = {
      amount,
      description: 'InactiveAdministrativeCost Transfer',
      fromId: forId,
      toId: 0,
    };

    const transfer = await new TransferService(this.manager).createTransfer(transferRequest);

    // Create a new inactive administrative cost
    const newInactiveAdministrativeCost: InactiveAdministrativeCost = Object.assign(new InactiveAdministrativeCost(), {
      fromId: forId,
      from: user,
      amount: dinero(amount),
      transfer: transfer,
    });

    transfer.inactiveAdministrativeCost = newInactiveAdministrativeCost;

    await this.manager.save(Transfer, transfer);
    await this.manager.save(newInactiveAdministrativeCost);

    const options = InactiveAdministrativeCostService.getOptions({ inactiveAdministrativeCostId: newInactiveAdministrativeCost.id });
    return this.manager.findOne(InactiveAdministrativeCost, options);
  }

  /**
   * Email all users with the given ids. These user will get notified that an administrative cost has been deducted from their account.
   * @param users
   */
  public async handOutInactiveAdministrativeCost(users: HandoutInactiveAdministrativeCostsRequest)
    : Promise<InactiveAdministrativeCost[]> {
    return Promise.all(users.userIds.map(async (u) => {
      const req: CreateInactiveAdministrativeCostRequest = { forId: u };

      const inactiveAdministrativeCost = await this.createInactiveAdministrativeCost(req);

      const user = await User.findOne({ where: { id: u } });

      await Mailer.getInstance().send(user, new UserGotInactiveAdministrativeCost({
        amount: inactiveAdministrativeCost.amount,
      }));

      return inactiveAdministrativeCost;
    }));
  }

  /**
   * Email all users with the given ids. These users will get notified that in a year time money will be deducted from their
   * account as they have been inactive for three years.
   * @param users
   */
  public async sendInactiveNotification(users: HandoutInactiveAdministrativeCostsRequest)
    : Promise<void> {

    await Promise.all(users.userIds.map(async (u) => {
      const user = await User.findOne({ where: { id: u } });

      user.inactiveNotificationSend = true;
      await user.save();

      return Mailer.getInstance().send(user, new InactiveAdministrativeCostNotification({}));
    }),
    );
  }

  /**
   * Returns database entities based on the given filter params
   * @param params
   */
  public async getInactiveAdministrativeCosts(params: InactiveAdministrativeCostFilterParameters = {})
    : Promise<InactiveAdministrativeCost[]> {
    const options = { ...InactiveAdministrativeCostService.getOptions(params) };
    return this.manager.find(InactiveAdministrativeCost, { ...options });
  }

  /**
   * Function that returns all inactive administrative cost entitites based on given params.
   * @param params
   * @param pagination - The pagination params to apply
   */
  public async getPaginatedInactiveAdministrativeCosts(params: InactiveAdministrativeCostFilterParameters = {},
    pagination: PaginationParameters = {}) {
    const { take, skip } = pagination;
    const options = { ...InactiveAdministrativeCostService.getOptions(params), skip, take };

    const inactiveAdministrativeCost = await this.manager.find(InactiveAdministrativeCost, { ...options, take });

    const records = InactiveAdministrativeCostService.toArrayResponse(inactiveAdministrativeCost);

    const count = await this.manager.count(InactiveAdministrativeCost, options);
    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  public static getOptions(params: InactiveAdministrativeCostFilterParameters): FindManyOptions<InactiveAdministrativeCost> {
    const filterMapping: FilterMapping = {
      fromId: 'fromId',
      inactiveAdministrativeCostId: 'id',
    };

    const relations: FindOptionsRelations<InactiveAdministrativeCost> = {
      from: true,
      transfer: { to: true },
    };

    const options: FindManyOptions<InactiveAdministrativeCost> = {
      where: {
        ...QueryFilter.createFilterWhereClause(filterMapping, params),
      },
      order: { createdAt: 'DESC' },
    };

    return { ...options, relations };
  }
}