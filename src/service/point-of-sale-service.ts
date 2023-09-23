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
import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import {
  PaginatedPointOfSaleResponse,
  PointOfSaleResponse,
  PointOfSaleWithContainersResponse,
} from '../controller/response/point-of-sale-response';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User from '../entity/user/user';
import Container from '../entity/container/container';
import ContainerRevision from '../entity/container/container-revision';
// eslint-disable-next-line import/no-cycle
import ContainerService from './container-service';
import { ContainerWithProductsResponse } from '../controller/response/container-response';
import { PaginationParameters } from '../helpers/pagination';
import {
  BasePointOfSaleParams,
  CreatePointOfSaleParams,
  UpdatePointOfSaleParams,
} from '../controller/request/point-of-sale-request';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import AuthenticationService from './authentication-service';

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
  /**
   * If containers should be added to the response
   */
  returnContainers?: boolean
  /**
   * Whether to select public points of sale.
   */
  public?: boolean;
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
      useAuthentication: rawPointOfSale.useAuthentication === 1,
      createdAt: rawPointOfSale.createdAt instanceof Date ? rawPointOfSale.createdAt.toISOString() : rawPointOfSale.createdAt,
      updatedAt: rawPointOfSale.updatedAt instanceof Date ? rawPointOfSale.updatedAt.toISOString() : rawPointOfSale.updatedAt,
      owner: {
        id: rawPointOfSale.owner_id,
        firstName: rawPointOfSale.owner_firstName,
        lastName: rawPointOfSale.owner_lastName,
      },
    };
  }

  /**
   * Function that adds all the container with products to a point of sale response.
   * It is slow and should be used sparsely.
   * @param pointOfSale - The point of sale to decorate
   */
  private static async asPointOfSaleResponseWithContainers(
    pointOfSale: PointOfSaleResponse,
  ): Promise<PointOfSaleWithContainersResponse> {
    const filters: any = {
      posId: pointOfSale.id,
      posRevision: pointOfSale.revision,
    };

    const containers = (await ContainerService
      .getContainers({ ...filters, returnProducts: true }))
      .records as ContainerWithProductsResponse[];

    return {
      ...pointOfSale as PointOfSaleResponse,
      containers,
    };
  }

  private static async buildGetPointsOfSaleQuery(filters: PointOfSaleParameters = {}, user?: User)
    : Promise<SelectQueryBuilder<PointOfSale>> {
    const builder = createQueryBuilder()
      .from(PointOfSale, 'pos')
      .innerJoin(
        PointOfSaleRevision,
        'posrevision',
        'pos.id = posrevision.pointOfSale.id',
      )
      .innerJoin('pos.owner', 'owner')
      .select([
        'pos.id AS id',
        'pos.createdAt AS createdAt',
        'posrevision.revision AS revision',
        'posrevision.updatedAt AS updatedAt',
        'posrevision.name AS name',
        'posrevision.useAuthentication AS useAuthentication',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    if (filters.pointOfSaleRevision === undefined) builder.where('pos.currentRevision = posrevision.revision');

    const filterMapping: FilterMapping = {
      pointOfSaleId: 'pos.id',
      pointOfSaleRevision: 'posrevision.revision',
      ownerId: 'owner.id',
    };

    QueryFilter.applyFilter(builder, filterMapping, filters);

    if (user) {
      const organIds = (await AuthenticationService.getMemberAuthenticators(user)).map((u) => u.id);
      builder.andWhere('owner.id IN (:...organIds)', { organIds });
    }

    builder.orderBy({ 'pos.id': 'DESC' });

    return builder;
  }

  /**
   * Query to return current point of sales.
   * @param filters - Parameters to query the point of sales with.
   * @param pagination
   * @param user
   */
  public static async getPointsOfSale(
    filters: PointOfSaleParameters = {}, pagination: PaginationParameters = {}, user?: User,
  ): Promise<PaginatedPointOfSaleResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      (await this.buildGetPointsOfSaleQuery(filters, user)).limit(take).offset(skip).getRawMany(),
      (await this.buildGetPointsOfSaleQuery(filters, user)).getCount(),
    ]);

    let records;
    if (filters.returnContainers) {
      const pointOfSales: PointOfSaleWithContainersResponse[] = [];
      await Promise.all(results[0].map(
        async (rawPointOfSale) => {
          pointOfSales.push(
            await this.asPointOfSaleResponseWithContainers(
              this.asPointOfSaleResponse(rawPointOfSale),
            ),
          );
        },
      ));
      records = pointOfSales;
    } else {
      records = results[0].map((rawPointOfSale) => this.asPointOfSaleResponse(rawPointOfSale));
    }

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Turns an PointOfSaleRevision into an PointOfSaleResponse
   */
  static toPointOfSaleResponse(pointOfSale: PointOfSaleRevision)
    : PointOfSaleResponse {
    return {
      name: pointOfSale.name,
      owner: parseUserToBaseResponse(pointOfSale.pointOfSale.owner, false),
      id: pointOfSale.pointOfSale.id,
      revision: pointOfSale.revision,
    } as PointOfSaleResponse;
  }

  public static async applyPointOfSaleUpdate(base: PointOfSale, update: BasePointOfSaleParams) {
    const containers = await Container.findByIds(update.containers);

    const containerIds: { revision: number, container: { id: number } }[] = (
      containers.map((container) => (
        ({ revision: container.currentRevision, container: { id: container.id } }))));
    const containerRevisions: ContainerRevision[] = await ContainerRevision.findByIds(containerIds);
    const pointOfSaleRevision: PointOfSaleRevision = Object.assign(new PointOfSaleRevision(), {
      pointOfSale: base,
      containers: containerRevisions,
      name: update.name,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
      useAuthentication: update.useAuthentication,
    });

    // First save revision.
    await PointOfSaleRevision.save(pointOfSaleRevision);

    // Increment current revision.
    // eslint-disable-next-line no-param-reassign
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();
  }

  /**
   * Creates a new PointOfSale
   *
   * If approve is false, then the newly created PointOfSale has no revision.
   * To confirm the revision the update has to be accepted.
   *
   * @param posRequest - The POS to be created.
   */
  public static async createPointOfSale(posRequest: CreatePointOfSaleParams) {
    const owner = await User.findOne({ where: { id: posRequest.ownerId } });

    if (!owner) return undefined;

    const base = Object.assign(new PointOfSale(), {
      owner,
    });

    // Save the base and update..
    await base.save();
    const update: UpdatePointOfSaleParams = {
      ...posRequest,
      id: base.id,
    };

    let createdPointOfSale;
    createdPointOfSale = await this.directPointOfSaleUpdate(update);

    return createdPointOfSale;
  }

  /**
   * Revises a point of sale without creating an update
   * @param update - the point of sale update to pass
   */
  public static async directPointOfSaleUpdate(update: UpdatePointOfSaleParams)
    : Promise<PointOfSaleWithContainersResponse> {
    const base: PointOfSale = await PointOfSale.findOne({ where: { id: update.id } });
    await this.applyPointOfSaleUpdate(base, update);
    return (this.getPointsOfSale({ pointOfSaleId: base.id, returnContainers: true })
      .then((p) => p.records[0])) as Promise<PointOfSaleWithContainersResponse>;
  }

  /**
   * Test to see if the user can view a specified Point of Sale
   * @param userId - The User to test
   * @param pointOfSale - The Point of Sale to view
   */
  public static async canViewPointOfSale(userId: number, pointOfSale: PointOfSale)
    : Promise<boolean> {
    if (!pointOfSale) return false;
    return pointOfSale.owner.id === userId;
  }
}
