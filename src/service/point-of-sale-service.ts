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
  PaginatedPointOfSaleResponse, PaginatedUpdatedPointOfSaleResponse,
  PointOfSaleResponse,
  PointOfSaleWithContainersResponse,
  UpdatedPointOfSaleResponse,
} from '../controller/response/point-of-sale-response';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import UpdatedPointOfSale from '../entity/point-of-sale/updated-point-of-sale';
import PointOfSaleRequest from '../controller/request/point-of-sale-request';
import User from '../entity/user/user';
import Container from '../entity/container/container';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import UpdatePointOfSaleRequest from '../controller/request/update-point-of-sale-request';
import UpdatedContainer from '../entity/container/updated-container';
import UnapprovedContainerError from '../entity/errors/unapproved-container-error';
import ContainerRevision from '../entity/container/container-revision';
import ContainerService, { ContainerParameters } from './container-service';
import { ContainerWithProductsResponse } from '../controller/response/container-response';
import { PaginationParameters } from '../helpers/pagination';

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
   * Function that adds all the container with products to a point of sale response.
   * It is slow and should be used sparsely.
   * @param pointOfSale - The point of sale to decorate
   */
  private static async asPointOfSaleResponseWithContainers(
    pointOfSale: PointOfSaleResponse | UpdatedPointOfSaleResponse,
  ): Promise<PointOfSaleWithContainersResponse> {
    const containerIds = (
      (await ContainerService.getContainers({ posId: pointOfSale.id })).records.map((c) => c.id));
    const containers: ContainerWithProductsResponse[] = [];
    await Promise.all(
      containerIds.map(
        async (c) => { containers.push(await ContainerService.getProductsResponse(c)); },
      ),
    );

    return {
      ...pointOfSale,
      containers,
    };
  }

  private static buildGetPointsOfSaleQuery(filters: PointOfSaleParameters = {})
    : SelectQueryBuilder<PointOfSale> {
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

    if (filters.pointOfSaleRevision === undefined) builder.where('pos.currentRevision = posrevision.revision');

    const filterMapping: FilterMapping = {
      pointOfSaleId: 'pos.id',
      pointOfSaleRevision: 'posrevision.revision',
      startDate: 'posrevision.startDate',
      endDate: 'posrevision.endDate',
      useAuthentication: 'posrevision.useAuthentication',
      ownerId: 'owner.id',
    };

    QueryFilter.applyFilter(builder, filterMapping, filters);

    return builder;
  }

  /**
   * Query to return current point of sales.
   * @param filters - Parameters to query the point of sales with.
   * @param pagination
   */
  public static async getPointsOfSale(
    filters: PointOfSaleParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedPointOfSaleResponse | PointOfSaleWithContainersResponse[]> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      this.buildGetPointsOfSaleQuery(filters).limit(take).offset(skip).getRawMany(),
      this.buildGetPointsOfSaleQuery(filters).getCount(),
    ]);

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
      return pointOfSales;
    }

    const records = results[0].map((rawPointOfSale) => this.asPointOfSaleResponse(rawPointOfSale));
    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  public static buildGetUpdatedPointsOfSaleQuery(
    filters: PointOfSaleParameters = {},
  ): SelectQueryBuilder<PointOfSale> {
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
    QueryFilter.applyFilter(builder, filterMapping, filters);

    return builder;
  }

  /**
   * Query to return updated (pending) point of sales.
   * @param filters - Parameters to query the point of sales with.
   * @param pagination
   */
  public static async getUpdatedPointsOfSale(
    filters: PointOfSaleParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedUpdatedPointOfSaleResponse | PointOfSaleWithContainersResponse[]> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      this.buildGetUpdatedPointsOfSaleQuery(filters).limit(take).offset(skip).getRawMany(),
      this.buildGetUpdatedPointsOfSaleQuery(filters).getCount(),
    ]);

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
      return pointOfSales;
    }

    const records = results[0].map(
      (rawPointOfSale) => this.asPointOfSaleResponse(rawPointOfSale) as UpdatedPointOfSaleResponse,
    );

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Turns an updatedPointOfSale into an UpdatedPointOfSaleResponse
   */
  static toUpdatedPointOfSaleResponse(updatedPointOfSale: UpdatedPointOfSale)
    : UpdatedPointOfSaleResponse {
    return {
      name: updatedPointOfSale.name,
      owner: parseUserToBaseResponse(updatedPointOfSale.pointOfSale.owner, false),
      startDate: updatedPointOfSale.startDate.toISOString(),
      endDate: updatedPointOfSale.endDate.toISOString(),
      useAuthentication: updatedPointOfSale.useAuthentication,
      id: updatedPointOfSale.pointOfSale.id,
    } as UpdatedPointOfSaleResponse;
  }

  /**
   * Turns an PointOfSaleRevision into an PointOfSaleResponse
   */
  static toPointOfSaleResponse(pointOfSale: PointOfSaleRevision)
    : PointOfSaleResponse {
    return {
      name: pointOfSale.name,
      owner: parseUserToBaseResponse(pointOfSale.pointOfSale.owner, false),
      startDate: pointOfSale.startDate.toISOString(),
      endDate: pointOfSale.endDate.toISOString(),
      useAuthentication: pointOfSale.useAuthentication,
      id: pointOfSale.pointOfSale.id,
      revision: pointOfSale.revision,
    } as PointOfSaleResponse;
  }

  /**
   * Function that returns all the points of sale visible to a user.
   * @param params
   * @param pagination
   * @param updated
   */
  public static async getPointsOfSaleInUserContext(
    params: PointOfSaleParameters, pagination: PaginationParameters = {}, updated?: boolean,
  ): Promise<PointOfSaleResponse[] | UpdatedPointOfSaleResponse[]> {
    const publicPOS: any = updated
      ? (await this.getUpdatedPointsOfSale(
        { ...params, ownerId: undefined, public: true } as ContainerParameters, pagination,
      ))
      : (await this.getPointsOfSale(
        { ...params, ownerId: undefined, public: true } as ContainerParameters, pagination,
      ));

    const ownPOS: any = updated
      ? (await this.getUpdatedPointsOfSale(
        { ...params, public: false } as ContainerParameters,
      ))
      : (await this.getPointsOfSale(
        { ...params, public: false } as ContainerParameters,
      ));

    return publicPOS.concat(ownPOS);
  }

  /**
   * Confirms a PointOfSale update and creates a PointOfSale revision,
   * @param pointOfSaleId - The PointOfSale update to confirm.
   */
  public static async approvePointOfSaleUpdate(pointOfSaleId: number)
    : Promise<PointOfSaleWithContainersResponse> {
    const [base, rawPointOfSaleUpdate] = (
      await Promise.all(
        [PointOfSale.findOne(pointOfSaleId, { relations: ['owner'] }), UpdatedPointOfSale.findOne(pointOfSaleId, { relations: ['containers'] })],
      )
    );

    // Return undefined if base or update not found.
    if (!base || !rawPointOfSaleUpdate) {
      return undefined;
    }

    const containerIds: { revision: number, container: { id: number } }[] = (
      rawPointOfSaleUpdate.containers.map((container) => (
        ({ revision: container.currentRevision, container: { id: container.id } }))));

    const updatedContainers: UpdatedContainer[] = await UpdatedContainer.findByIds(containerIds, { relations: ['container'] });

    if (updatedContainers.length !== 0) {
      throw new UnapprovedContainerError(`Point of sale has the unapproved container(s): [${updatedContainers.map((c) => c.container.id)}]`);
    }

    const containerRevisions: ContainerRevision[] = await ContainerRevision.findByIds(containerIds);

    const pointOfSaleRevision: PointOfSaleRevision = Object.assign(new PointOfSaleRevision(), {
      pointOfSale: base,
      containers: containerRevisions,
      name: rawPointOfSaleUpdate.name,
      startDate: rawPointOfSaleUpdate.startDate,
      endDate: rawPointOfSaleUpdate.endDate,
      useAuthentication: rawPointOfSaleUpdate.useAuthentication,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
    });

    // First save revision.
    await PointOfSaleRevision.save(pointOfSaleRevision);

    // Increment current revision.
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();

    // Remove update after revision is created.
    await UpdatedPointOfSale.delete(pointOfSaleId);

    // Return the new point of sale.
    return await this.asPointOfSaleResponseWithContainers(
      this.asPointOfSaleResponse(pointOfSaleRevision),
    );
  }

  /**
   * Creates a PointOfSale update
   * @param pointOfSaleId - The ID of the PointOfSale to update.
   * @param update - The PointOfSale variables to update.
   */
  public static async updatePointOfSale(pointOfSaleId: number, update: UpdatePointOfSaleRequest)
    : Promise<UpdatedPointOfSaleResponse> {
    // Get base PointOfSale
    const base: PointOfSale = await PointOfSale.findOne(pointOfSaleId, { relations: ['owner'] });

    // Return undefined if base does not exist.
    if (!base) {
      return undefined;
    }

    const containers = update.containers ? await Container.findByIds(update.containers) : [];

    // Create update object
    const updatedPointOfSale = Object.assign(new UpdatedPointOfSale(), {
      ...update,
      pointOfSale: base,
      containers,
      startDate: new Date(update.startDate),
      endDate: new Date(update.endDate),
    });

    // Save update
    await updatedPointOfSale.save();
    return this.toUpdatedPointOfSaleResponse(updatedPointOfSale);
  }

  /**
   * Creates a new PointOfSale
   *
   * The newly created PointOfSale in the PointOfSale table and has no current revision.
   * To confirm the revision the update has to be accepted.
   *
   * @param posRequest - The POS to be created.
   */
  public static async createPointOfSale(posRequest: PointOfSaleRequest)
    : Promise<UpdatedPointOfSaleResponse> {
    const base = Object.assign(new PointOfSale(), {
      owner: await User.findOne(posRequest.ownerId),
    });

    // Save the base and create update request.
    await base.save();
    return this.updatePointOfSale(base.id, posRequest.update);
  }

  /**
   * Verifies whether the PointOfSaleRequest translates to a valid object.
   * @param {PointOfSaleRequest.model} posRequest - The PointOfSale request
   * @returns {boolean} whether the request is valid
   */
  public static async verifyPointOfSale(posRequest: PointOfSaleRequest | UpdatePointOfSaleRequest)
    : Promise<boolean> {
    let update: UpdatePointOfSaleRequest;
    if (Object.prototype.hasOwnProperty.call(posRequest, 'update')) {
      update = (posRequest as PointOfSaleRequest).update;
    } else {
      update = (posRequest as UpdatePointOfSaleRequest);
    }

    const startDate = Date.parse(update.startDate);
    const endDate = Date.parse(update.endDate);

    const check: boolean = update.name !== ''
        // Dates must exist.
        && !Number.isNaN(startDate) && !Number.isNaN(endDate)
        // End date must be in the future.
        && endDate > new Date().getTime()
        // End date must be after start date.
        && endDate > startDate;

    if (Object.prototype.hasOwnProperty.call(posRequest, 'ownerId')) {
      // Owner must exist.
      if (await User.findOne({ id: (posRequest as PointOfSaleRequest).ownerId }) === undefined) {
        return false;
      }
    }

    if (!check) return false;

    if (update.containers) {
      const containers = await Container.findByIds(update.containers);
      if (containers.length !== update.containers.length) return false;
    }

    return true;
  }

  /**
   * Test to see if the user can view a specified Point of Sale
   * @param userId - The User to test
   * @param pointOfSaleId - The Point of Sale to view
   */
  public static async canViewPointOfSale(userId: number, pointOfSaleId: number): Promise<boolean> {
    const pointOfSale: PointOfSale = await PointOfSale.findOne(pointOfSaleId, { relations: ['owner'] });
    if (!pointOfSale) return false;
    return pointOfSale.owner.id === userId;
  }
}
