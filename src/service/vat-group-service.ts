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

import { FindManyOptions } from 'typeorm';
import { DineroObject } from 'dinero.js';
import { PaginationParameters } from '../helpers/pagination';
import VatGroup, { VatDeclarationPeriod } from '../entity/vat-group';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import {
  BaseVatGroupResponse,
  PaginatedVatGroupResponse,
  VatDeclarationResponse,
  VatDeclarationRow, VatGroupResponse,
} from '../controller/response/vat-group-response';
import { UpdateVatGroupRequest, VatGroupRequest } from '../controller/request/vat-group-request';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asNumber, asVatDeclarationPeriod } from '../helpers/validators';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import ProductRevision from '../entity/product/product-revision';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import ProductService from './product-service';
import { AppDataSource } from '../database/database';

interface VatGroupFilterParameters {
  vatGroupId?: number;
  name?: string;
  percentage?: number;
  deleted?: boolean;
  hidden?: boolean;
}

interface IntermediateVatDeclarationRow extends VatDeclarationRow {
  deleted: boolean;
}

interface VatDeclarationParams {
  /**
   * In what period you have to do VAT declaration at the Belastingdienst
   */
  period: VatDeclarationPeriod;
  /**
   * Calendar year
   */
  year: number;
}

export async function canSetVatGroupToDeleted(vatGroupId: number): Promise<boolean> {
  const products = await ProductService.getProducts({
    vatGroupId,
  });
  return products.records.length === 0;
}

export function parseGetVatGroupsFilters(req: RequestWithToken): VatGroupFilterParameters {
  return {
    vatGroupId: asNumber(req.query.transactionId),
    name: req.query.name as string,
    percentage: asNumber(req.query.percentage),
    deleted: asBoolean(req.query.deleted),
  };
}

export function parseGetVatCalculationValuesParams(req: RequestWithToken): VatDeclarationParams {
  return {
    period: asVatDeclarationPeriod(req.query.period),
    year: asNumber(req.query.year),
  };
}

export default class VatGroupService {
  public static toBaseResponse(vatGroup: VatGroup): BaseVatGroupResponse {
    return {
      id: vatGroup.id,
      createdAt: vatGroup.createdAt.toISOString(),
      updatedAt: vatGroup.updatedAt.toISOString(),
      version: vatGroup.version,
      percentage: vatGroup.percentage,
      hidden: vatGroup.hidden,
    };
  }

  public static toResponse(vatGroup: VatGroup): VatGroupResponse {
    return {
      ...this.toBaseResponse(vatGroup),
      name: vatGroup.name,
      deleted: vatGroup.deleted,
    };
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
      deleted: 'deleted',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(mapping, filters),
      order: { id: 'ASC' },
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
    vatGroup.deleted = vatGroupReq.deleted;
    vatGroup.hidden = vatGroupReq.hidden;

    return VatGroup.save(vatGroup);
  }

  /**
   * Calculate the collected VAT for the periodic declaration at the tax authorization.
   * The values are calculated as follows (based on rules of the Dutch tax
   * athorization (De Belastingdienst):
   * Every product has a VAT-included price. From this price (e.g. including 21% VAT),
   * we derive the absolute VAT amount by multiplying this incl-price by 21 and then
   * dividing by 121. Of course, we also multiply this number by the number of times
   * this product has been bought in a single SubTransactionRow. We round this number
   * on cents. We add up all these VAT-amounts for every SubTransactionRow and we sum
   * everything up based on the year and the period in the year.
   * @param params
   */
  public static async calculateVatDeclaration(
    params: VatDeclarationParams,
  ): Promise<VatDeclarationResponse> {
    let divider: number;
    let periods: number;
    switch (params.period) {
      case VatDeclarationPeriod.MONTHLY: divider = 1; periods = 12; break;
      case VatDeclarationPeriod.QUARTERLY: divider = 3; periods = 4; break;
      case VatDeclarationPeriod.ANNUALLY: divider = 12; periods = 1; break;
      default: throw new Error(`Unknown VAT declaration interval: ${params.period}`);
    }

    const vatGroups = await VatGroup.find({ where: { deleted: false } });

    const builder = AppDataSource.createQueryBuilder(SubTransactionRow, 'str')
      .select([
        'vatgroup.id as id',
        'MAX(vatgroup.name) as name',
        'MAX(vatgroup.percentage) as percentage',
        'MAX(vatgroup.deleted) as deleted',
        // Timezones are a bitch
        process.env.TYPEORM_CONNECTION === 'sqlite'
          ? `(STRFTIME('%m', DATETIME(str.createdAt, '${(new Date()).getTimezoneOffset()} minutes')) - 1) / ${divider} as period`
          : `FLOOR((DATE_FORMAT(DATE_ADD(str.createdAt, INTERVAL ${(new Date()).getTimezoneOffset()} MINUTE), '%m') - 1) / ${divider}) as period`,
        process.env.TYPEORM_CONNECTION === 'sqlite'
          ? 'Strftime(\'%Y\', str.createdAt) as year'
          : 'DATE_FORMAT(str.createdAt, \'%Y\') as year',
        'SUM(ROUND((str.amount * product.priceInclVat * vatgroup.percentage) / (100 + vatgroup.percentage))) as value',
      ])
      .innerJoin(ProductRevision, 'product', 'str.productRevision = product.revision AND str.productProductId = product.productId')
      .innerJoin(VatGroup, 'vatgroup', 'product.vatId = vatgroup.id')
      .where('str.invoiceId IS NULL')
      .andWhere(`${process.env.TYPEORM_CONNECTION === 'sqlite'
        ? 'Strftime(\'%Y\', str.createdAt)'
        : 'DATE_FORMAT(str.createdAt, \'%Y\')'} = :year`, { year: params.year.toString() })
      .groupBy('vatgroup.id')
      .addGroupBy('period')
      .orderBy('vatgroup.id');

    const rawResults = await builder.getRawMany();

    const dineroTransformer = DineroTransformer.Instance;
    const resultRows: IntermediateVatDeclarationRow[] = [];
    let values: DineroObject[] = [];
    let lastSeenObject = rawResults[0];

    const fillAndSave = (resultRow: any) => {
      while (values.length < periods) {
        values.push(dineroTransformer.from(0).toObject());
      }

      resultRows.push({
        id: resultRow.id,
        name: resultRow.name,
        percentage: resultRow.percentage,
        deleted: resultRow.deleted,
        values,
      });
      values = [];
    };

    for (let i = 0; i < rawResults.length; i += 1) {
      if (lastSeenObject.id !== rawResults[i].id) {
        fillAndSave(lastSeenObject);
      }

      // Fill in intermediate values
      while (values.length < rawResults[i].period) {
        values.push(dineroTransformer.from(0).toObject());
      }

      values.push(dineroTransformer.from(rawResults[i].value).toObject());
      lastSeenObject = rawResults[i];
    }

    if (lastSeenObject) fillAndSave(lastSeenObject);

    vatGroups.forEach((v) => {
      if (resultRows.findIndex((r) => r.id === v.id) < 0) {
        resultRows.push({
          id: v.id,
          percentage: v.percentage,
          name: v.name,
          deleted: v.deleted,
          values: (new Array(periods)).fill(dineroTransformer.from(0).toObject()),
        });
      }
    });

    // Keep all rows that have deleted set to false or have at least one actual value in the row
    const filteredRows = resultRows
      .filter((r) => !r.deleted
        || r.values.reduce((prev, curr) => Math.max(prev, curr.amount), 0) > 0);

    const sortedRows = filteredRows.sort((a, b) => a.id - b.id);

    return {
      period: params.period,
      calendarYear: params.year,
      rows: sortedRows.map((r) => ({
        id: r.id, name: r.name, percentage: r.percentage, values: r.values,
      })),
    };
  }
}
