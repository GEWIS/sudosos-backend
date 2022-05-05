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
import { FindManyOptions } from 'typeorm';
import { PaginationParameters } from '../helpers/pagination';
import VatGroup from '../entity/vat-group';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { PaginatedVatGroupResponse } from '../controller/response/vat-group-response';
import { UpdateVatGroupRequest, VatGroupRequest } from '../controller/request/vat-group-request';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asNumber } from '../helpers/validators';

interface VatGroupFilterParameters {
  vatGroupId?: number;
  name?: string;
  percentage?: number;
  hideIfZero?: boolean;
}

export function parseGetVatGroupsFilters(req: RequestWithToken): VatGroupFilterParameters {
  return {
    vatGroupId: asNumber(req.query.transactionId),
    name: req.query.name as string,
    percentage: asNumber(req.query.percentage),
    hideIfZero: asBoolean(req.query.hideIfZero),
  };
}

export default class VatGroupService {
  public static verifyVatGroup(vr: VatGroupRequest): boolean {
    return VatGroupService.verifyUpdateVatGroup(vr)
      && typeof vr.percentage === 'number'
      && vr.percentage >= 0;
  }

  public static verifyUpdateVatGroup(vr: UpdateVatGroupRequest): boolean {
    return vr.name !== ''
      && typeof vr.hideIfZero === 'boolean';
  }

  /**
   * Returns all VAT groups with options.
   * @param filters - The filtering parameters.
   * @param pagination - The pagination options.
   */
  public static async getVatGroups(
    filters: VatGroupFilterParameters, pagination: PaginationParameters = {},
  ): Promise<PaginatedVatGroupResponse> {
    const { take, skip } = pagination;

    const mapping: FilterMapping = {
      vatGroupId: 'id',
      name: 'name',
      percentage: 'percentage',
      hideIfZero: 'hideIfZero',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(mapping, filters),
    };

    const records = await VatGroup.find({
      ...options,
      take,
      skip,
    }) as VatGroup[];

    return {
      _pagination: {
        take,
        skip,
        count: await VatGroup.count(options),
      },
      records,
    };
  }

  /**
   * Save a new VAT group to the database
   * @param vatGroupReq
   */
  public static async createVatGroup(vatGroupReq: VatGroupRequest): Promise<VatGroup> {
    const vatGroup = Object.assign(new VatGroup(), {
      name: vatGroupReq.name,
      percentage: vatGroupReq.percentage,
    });

    return VatGroup.save(vatGroup);
  }

  /**
   * Update a VAT group
   * @param id
   * @param vatGroupReq
   */
  public static async updateVatGroup(
    id: number, vatGroupReq: UpdateVatGroupRequest,
  ): Promise<VatGroup | undefined> {
    const vatGroup: VatGroup = await VatGroup.findOne({ where: { id } });
    if (!vatGroup) {
      return undefined;
    }

    vatGroup.name = vatGroupReq.name;
    vatGroup.hideIfZero = vatGroupReq.hideIfZero;

    return VatGroup.save(vatGroup);
  }
}
