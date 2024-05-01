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
import User from '../entity/user/user';

/**
 * Parameters for type of administrative cost, notification or fine
 */

export interface InactivityAdministrativeCostFilterParameters {
  /**
   * Filter based on userId
   */
  userId?: number,
}

export default class AdministrativeCostService {

  /**
   *
   * @param params
   */
  public static async getInactivityAdministrativeCost(params: InactivityAdministrativeCostFilterParameters = {})
    : Promise<InactivityAdministrativeCosts[]> {
    const options = { ...this.getOptions(params) };

    return InactivityAdministrativeCosts.find({ ...options });
  }

  public static getOptions(params: InactivityAdministrativeCostFilterParameters): FindManyOptions<InactivityAdministrativeCosts> {
    const filterMapping: FilterMapping = {
      userId: 'from.id',
    };

    const relations: FindOptionsRelations<InactivityAdministrativeCosts> = { from: true };
    const options: FindManyOptions<InactivityAdministrativeCosts> = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      order: { createdAt: 'ASC' },
    };

    return { ...options, relations };
  }
}