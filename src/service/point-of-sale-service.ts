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
import { createQueryBuilder } from 'typeorm';
import { PointOfSaleResponse, UpdatedPointOfSaleResponse } from '../controller/response/point-of-sale-response';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import UpdatedPointOfSale from '../entity/point-of-sale/updated-point-of-sale';

/**
 * Define point of sale filtering parameters used to filter query results.
 */
export interface PointOfSaleParameters {
  /**
   * Filter based on point of sale id.
   */
  pointOfSaleId?: number;
  /**
   * Filter based on point of sale revision.
   */
  pointOfSaleRevision?: number;
  /**
   * Filter based on point of sale owner.
   */
  ownerId?: number;
  // TODO: implement filters on start and end date
  // /**
  //  * Filter based on point of sale start date.
  //  */
  // startDate?: Date;
  // /**
  //  * Filter based on point of sale end date.
  //  */
  // endDate?: Date;
  /**
   * Filter based on whether a point of sale uses authentication.
   */
  useAuthentication?: boolean;
}

export default class PointOfSaleService {
  /**
   * Helper function for the base mapping the raw getMany response point of sale.
   * @param rawPointOfSale - the raw response to parse.
   */
  private static asPointOfSaleResponse(rawPointOfSale: any): PointOfSaleResponse {
    return {
      id: rawPointOfSale.id,
      revision: rawPointOfSale.revision,
      name: rawPointOfSale.name,
      startDate: rawPointOfSale.startDate,
      endDate: rawPointOfSale.endDate,
      useAuthentication: rawPointOfSale.useAuthentication === 1,
      createdAt: rawPointOfSale.createdAt,
      updatedAt: rawPointOfSale.updatedAt,
      owner: {
        id: rawPointOfSale.owner_id,
        firstName: rawPointOfSale.owner_firstName,
        lastName: rawPointOfSale.owner_lastName,
      },
    };
  }

  /**
   * Query to return current point of sales.
   * @param params - Parameters to query the point of sales with.
   */
  public static async getPointOfSales(params: PointOfSaleParameters = {})
    : Promise<PointOfSaleResponse[]> {
    const builder = createQueryBuilder()
      .from(PointOfSale, 'pos')
      .innerJoin(
        PointOfSaleRevision,
        'posrevision',
        'pos.id = posrevision.pointOfSale',
      )
      .innerJoin('pos.owner', 'owner')
      .select([
        'pos.id AS id',
        'pos.createdAt AS createdAt',
        'posrevision.revision AS revision',
        'posrevision.updatedAt AS updatedAt',
        'posrevision.name AS name',
        'posrevision.startDate AS startDate',
        'posrevision.endDate AS endDate',
        'posrevision.useAuthentication AS useAuthentication',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    if (params.pointOfSaleRevision === undefined) builder.where('pos.currentRevision = posrevision.revision');

    const filterMapping: FilterMapping = {
      pointOfSaleId: 'pos.id',
      pointOfSaleRevision: 'posrevision.revision',
      startDate: 'posrevision.startDate',
      endDate: 'posrevision.endDate',
      useAuthentication: 'posrevision.useAuthentication',
      ownerId: 'owner.id',
    };

    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawPointOfSales = await builder.getRawMany();

    return rawPointOfSales.map((rawPointOfSale) => this.asPointOfSaleResponse(rawPointOfSale));
  }

  /**
   * Query to return updated (pending) point of sales.
   * @param params - Parameters to query the point of sales with.
   */
  public static async getUpdatedPointOfSales(params: PointOfSaleParameters = {})
    : Promise<UpdatedPointOfSaleResponse[]> {
    const builder = createQueryBuilder()
      .from(PointOfSale, 'pos')
      .innerJoin(
        UpdatedPointOfSale,
        'updatedpos',
        'pos.id = updatedpos.pointOfSaleId',
      )
      .innerJoin('pos.owner', 'owner')
      .select([
        'pos.id AS id',
        'pos.createdAt AS createdAt',
        'updatedpos.updatedAt AS updatedAt',
        'updatedpos.name AS name',
        'updatedpos.startDate AS startDate',
        'updatedpos.endDate AS endDate',
        'updatedpos.useAuthentication AS useAuthentication',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    const filterMapping: FilterMapping = {
      pointOfSaleId: 'pos.id',
      startDate: 'pos.startDate',
      endDate: 'pos.endDate',
      useAuthentication: 'pos.useAuthentication',
      ownerId: 'owner.id',
    };
    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawPointOfSales = await builder.getRawMany();

    return rawPointOfSales.map(
      (rawPointOfSale) => this.asPointOfSaleResponse(rawPointOfSale) as UpdatedPointOfSaleResponse,
    );
  }
}
