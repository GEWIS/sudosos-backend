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

import {
  FindManyOptions,
  FindOptionsRelations,
  FindOptionsWhere, In,
  Raw,

} from 'typeorm';
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
import { PaginationParameters } from '../helpers/pagination';
import {
  CreatePointOfSaleParams,
  UpdatePointOfSaleParams,
} from '../controller/request/point-of-sale-request';
import AuthenticationService from './authentication-service';
import { ContainerWithProductsResponse } from '../controller/response/container-response';

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
   * If products should be added to the response
   */
  returnProducts?: boolean
  /**
   * Whether to select public points of sale.
   */
  public?: boolean;
}

export default class PointOfSaleService {

  /**
   * Transforms a point of sale revision into a response.
   * @param revision
   * @private
   */
  private static revisionToResponse(revision: PointOfSaleRevision): PointOfSaleResponse | PointOfSaleWithContainersResponse {
    const response: PointOfSaleResponse = {
      id: revision.pointOfSale.id,
      revision: revision.revision,
      name: revision.name,
      useAuthentication: revision.useAuthentication,
      createdAt: revision.pointOfSale.createdAt.toISOString(),
      updatedAt: revision.pointOfSale.updatedAt.toISOString(),
      owner: {
        id: revision.pointOfSale.owner.id,
        firstName: revision.pointOfSale.owner.firstName,
        lastName: revision.pointOfSale.owner.lastName,
      },
    };
    if (revision.containers) {
      return {
        ...response,
        containers: revision.containers.map((c) => ContainerService.revisionToResponse(c)) as ContainerWithProductsResponse[],
      };
    }
    return response;
  }

  /**
   * Raw sql to deal with current revision.
   * @param revision
   */
  public static revisionSubQuery(revision?: number): string {
    if (revision) return `${revision}`;
    return PointOfSale
      .getRepository()
      .createQueryBuilder('pos')
      .select('pos.currentRevision')
      .where('pos.id = PointOfSaleRevision.pointOfSaleId').getSql();
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

    const [data, count] = await PointOfSaleRevision.findAndCount({ ...(await this.getOptions(filters, user)), take, skip });

    const records = data.map((revision: PointOfSaleRevision) => this.revisionToResponse(revision));
    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  /**
   * Updates a PointOfSale
   * @param update - The update to apply
   */
  public static async updatePointOfSale(update: UpdatePointOfSaleParams): Promise<PointOfSaleWithContainersResponse> {
    const base = await PointOfSale.findOne({ where: { id: update.id } });
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

    const options = await this.getOptions({ pointOfSaleId: base.id, returnContainers: true, returnProducts: true });
    return (this.revisionToResponse(await PointOfSaleRevision.findOne({ ...options }))) as PointOfSaleWithContainersResponse;
  }

  /**
   * Creates a new PointOfSale
   *
   * @param posRequest - The POS to be created.
   */
  public static async createPointOfSale(posRequest: CreatePointOfSaleParams) {
    const owner = await User.findOne({ where: { id: posRequest.ownerId } });

    if (!owner) return undefined;

    const base = Object.assign(new PointOfSale(), {
      owner,
    });

    // Save the base and update.
    await base.save();
    const update: UpdatePointOfSaleParams = {
      ...posRequest,
      id: base.id,
    };
    return this.updatePointOfSale(update);

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

  public static async getOptions(params: PointOfSaleParameters, user?: User): Promise<FindManyOptions<PointOfSaleRevision>> {
    const filterMapping: FilterMapping = {
      pointOfSaleId: 'pointOfSaleId',
    };

    const relations: FindOptionsRelations<PointOfSaleRevision> = {
      pointOfSale: {
        owner: true,
      },
    };

    if (params.returnContainers) {
      relations.containers = {
        container: {
          owner: true,
        },
      };
      if (params.returnProducts) {
        relations.containers.products = {
          product: {
            image: true,
            owner: true,
          },
          category: true,
          vat: true,
        };
      }
    }


    let revisionFilter: any = {};
    revisionFilter.revision = Raw(alias => `${alias} = (${this.revisionSubQuery(params.pointOfSaleRevision)})`);

    const userFilter: any = {};
    if (user) {
      const organIds = (await AuthenticationService.getMemberAuthenticators(user)).map((u) => u.id);
      userFilter.pointOfSale = { owner: { id: In(organIds) } };
    } else if (params.ownerId) {
      userFilter.pointOfSale = { owner: { id: params.ownerId } };
    }

    let where: FindOptionsWhere<PointOfSaleRevision> = {
      ...QueryFilter.createFilterWhereClause(filterMapping, params),
      ...userFilter,
      ...revisionFilter,
    };

    const options: FindManyOptions<PointOfSaleRevision> = {
      where,
      order: { createdAt: 'ASC' },
    };

    return { ...options, relations };
  }
}
