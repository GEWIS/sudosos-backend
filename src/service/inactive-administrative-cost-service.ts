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
import { FindManyOptions, FindOptionsRelations } from 'typeorm';
import InactiveAdministrativeCost from '../entity/transactions/inactive-administrative-cost';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User from '../entity/user/user';
import BalanceService from './balance-service';
import TransferService from './transfer-service';
import { CreateInactiveAdministrativeCostRequest } from '../controller/request/inactive-administrative-cost-request';
import TransferRequest from '../controller/request/transfer-request';
import dinero from 'dinero.js';
import { DineroObjectRequest } from '../controller/request/dinero-request';


interface InactiveAdministrativeCostFilterParameters {
  /**
   * Filter based on user id
   */
  fromId?: number;

  /**
   * Filter based on inactive administrative cost id
   */
  inactiveAdministrativeCostId?: number;
}

export default class InactiveAdministrativeCostService extends WithManager {

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

    const monetaryAmount = (userBalance.amount.amount < 5) ? userBalance.amount.amount - 5 : 5;

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
      toId: null,
    };

    const transfer = await new TransferService(this.manager).postTransfer(transferRequest);

    // Create a new inactive administrative cost
    const newInactiveAdministrativeCost: InactiveAdministrativeCost = Object.assign(new InactiveAdministrativeCost(), {
      fromId: forId,
      from: user,
      amount: dinero(amount),
      transfer: transfer,
    });

    await this.manager.save(InactiveAdministrativeCost, newInactiveAdministrativeCost);

    const options = InactiveAdministrativeCostService.getOptions({ inactiveAdministrativeCostId: newInactiveAdministrativeCost.id });
    return this.manager.findOne(InactiveAdministrativeCost, options);
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