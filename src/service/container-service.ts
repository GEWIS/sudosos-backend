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

import { FindManyOptions, FindOptionsRelations, FindOptionsWhere, In, IsNull, Raw } from 'typeorm';
import {
  ContainerResponse,
  ContainerWithProductsResponse,
  PaginatedContainerResponse,
  PaginatedContainerWithProductResponse,
} from '../controller/response/container-response';
import Container from '../entity/container/container';
import ContainerRevision from '../entity/container/container-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ProductRevision from '../entity/product/product-revision';
import { PaginationParameters } from '../helpers/pagination';
import { CreateContainerParams, UpdateContainerParams } from '../controller/request/container-request';
import User from '../entity/user/user';
import { UpdatePointOfSaleParams } from '../controller/request/point-of-sale-request';
// eslint-disable-next-line import/no-cycle
import PointOfSaleService from './point-of-sale-service';
// eslint-disable-next-line import/no-cycle
import ProductService from './product-service';
import AuthenticationService from './authentication-service';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';

interface ContainerVisibility {
  own: boolean;
  public: boolean;
}

/**
 * Define container filtering parameters used to filter query results.
 */
export interface ContainerFilterParameters {
  /**
   * Filter based on pointOfSale id.
   */
  posId?: number;
  /**
   * Filter based on pointOfSale revision.
   */
  posRevision?: number;
  /**
   * Whether to select public containers.
   */
  public?: boolean;
  /**
   * Filter based on container id.
   */
  containerId?: number;
  /**
   * Filter based on container revision.
   */
  containerRevision?: number;
  /**
   * Filter based on container owner.
   */
  ownerId?: number;
  /**
   * Filter on containers related to the given user.
   */
  userId?: number;
  returnProducts?: boolean;
  productId?: number;
  returnPointsOfSale?: boolean;
}

export default class ContainerService {
  public static revisionToResponse(revision: ContainerRevision): ContainerResponse | ContainerWithProductsResponse {
    const response: ContainerResponse = {
      id: revision.containerId,
      revision: revision.revision,
      name: revision.name,
      createdAt: revision.createdAt.toISOString(),
      updatedAt: revision.updatedAt.toISOString(),
      public: revision.container.public,
      owner: {
        id: revision.container.owner.id,
        firstName: revision.container.owner.firstName,
        lastName: revision.container.owner.lastName,
      },
    };
    if (revision.products) {
      return {
        ...response,
        products: revision.products.map((p) => ProductService.revisionToResponse(p)),
      };
    }
    return response;
  }

  public static revisionSubQuery(revision?: number): string {
    if (revision) return `${revision}`;
    return Container
      .getRepository()
      .createQueryBuilder('container')
      .select('container.currentRevision')
      .where('`container`.`id` = `ContainerRevision`.`containerId`').getSql();
  }

  /**
   * Query for getting all containers.
   * @param filters
   * @param pagination
   * @param user
   */
  public static async getContainers(
    filters: ContainerFilterParameters = {}, pagination: PaginationParameters = {}, user?: User,
  ): Promise<PaginatedContainerResponse | PaginatedContainerWithProductResponse> {
    const { take, skip } = pagination;

    const options = await this.getOptions(filters, user);
    const [data, count] = await ContainerRevision.findAndCount({ ...options, take, skip });

    const records = data.map((revision) => this.revisionToResponse(revision));

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  public static async getSingleContainer(filters: ContainerFilterParameters = {}): Promise<ContainerWithProductsResponse> {
    const options = await this.getOptions(filters);
    const container = await ContainerRevision.findOne({ ...options });
    return this.revisionToResponse(container) as ContainerWithProductsResponse;
  }

  /**
   * Creates a new container.
   * @param container - The params that describe the container to be created.
   */
  public static async createContainer(container: CreateContainerParams)
    : Promise<ContainerWithProductsResponse> {
    const base = Object.assign(new Container(), {
      public: container.public,
      owner: container.ownerId,
    });

    // Save the base.
    await base.save();

    const update: UpdateContainerParams = {
      ...container,
      id: base.id,
    };

    return this.updateContainer(update);
  }

  /**
   * Updates a container by directly creating a revision.
   * @param update - The container update
   */
  public static async updateContainer(update: UpdateContainerParams): Promise<ContainerWithProductsResponse> {
    const base = await Container.findOne({ where: { id: update.id } });

    // Get the latest products
    const opt = await ProductService.getOptions({});
    const where = { ...opt.where, product: { id: In(update.products) } };
    const productRevisions = await ProductRevision.find({ ...opt, where });

    // Set base container and apply new revision.
    const containerRevision: ContainerRevision = Object.assign(new ContainerRevision(), {
      container: base,
      products: productRevisions,
      name: update.name,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
    });

    // First save revision.
    await ContainerRevision.save(containerRevision);

    // Increment current revision.
    // eslint-disable-next-line no-param-reassign
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    // eslint-disable-next-line no-param-reassign
    base.public = update.public;
    await base.save();
    await this.propagateContainerUpdate(base.id);

    const options = await this.getOptions({ containerId: base.id, returnProducts: true });
    return (this.revisionToResponse(await ContainerRevision.findOne({ ...options }))) as ContainerWithProductsResponse;
  }

  /**
   * (Soft) delete a container
   * @param containerId
   */
  public static async deleteContainer(containerId: number): Promise<void> {
    const container = await Container.findOne({ where: { id: containerId } });
    if (container == null) {
      throw new Error('Container not found');
    }
    await Container.softRemove(container);
  }

  /**
   * Propagates the container update to all point of sales.
   *
   * All POS that contain the previous version of this container
   * will be revised to include the new revision.
   *
   * @param containerId - The container to propagate
   */
  public static async propagateContainerUpdate(containerId: number) {
    let options = await this.getOptions({ containerId: containerId, returnProducts: true, returnPointsOfSale: true });
    // Get previous revision of container.
    (options.where as FindOptionsWhere<ContainerRevision>).revision = Raw(alias => `${alias}  = (${this.revisionSubQuery()}) - 1`);
    const containerRevision = await ContainerRevision.findOne(options);

    // Container is new, no need to propagate.
    if (!containerRevision) return;

    // Only update POS that contain previous container but are current version themselves.
    const pos = containerRevision.pointsOfSale
      .reduce((a: PointOfSaleRevision[], b) => a.concat(b), [])
      .filter((p) => p.revision === p.pointOfSale.currentRevision)
      .filter((p, index, self) => (
        index === self.findIndex((p2) => p.pointOfSale.id === p2.pointOfSale.id)));

    // The async-for loop is intentional to prevent race-conditions.
    // To fix this the good way would be shortlived, the structure of POS/Containers will be changed
    for (let i = 0; i < pos.length; i += 1) {
      const p = pos[i];
      // eslint-disable-next-line no-await-in-loop
      const { containers } = p;
      const update: UpdatePointOfSaleParams = {
        containers: containers.map((c: ContainerRevision) => c.container.id),
        useAuthentication: p.useAuthentication,
        name: p.name,
        id: p.pointOfSale.id,
      };
      // eslint-disable-next-line no-await-in-loop
      await PointOfSaleService.updatePointOfSale(update);
    }
  }

  /**
   * Test to see if the user can view a specified container
   * @param userId - The User to test
   * @param container - The container to view
   */
  public static async canViewContainer(userId: number, container: Container)
    : Promise<ContainerVisibility> {
    const result: ContainerVisibility = { own: false, public: false };
    if (!container) return result;
    if (container.owner.id === userId) result.own = true;
    if (container.public) result.public = true;
    return result;
  }

  /**
   * Returns the options for the query
   * @param params
   * @param user
   */
  public static async getOptions(params: ContainerFilterParameters, user?: User): Promise<FindManyOptions<ContainerRevision>> {
    const filterMapping: FilterMapping = {
      containerId: 'containerId',
    };

    const relations: FindOptionsRelations<ContainerRevision> = {
      container: {
        owner: true,
      },
    };

    if (params.returnPointsOfSale) relations.pointsOfSale = {
      pointOfSale: true,
      containers: true,
    };

    if (params.returnProducts) relations.products = {
      product: {
        image: true,
        owner: true,
      },
      vat: true,
      category: true,
    };

    let owner: FindOptionsWhere<User> = {};
    if (user) {
      const organIds = (await AuthenticationService.getMemberAuthenticators(user)).map((u) => u.id);
      owner = { id: In(organIds) };
    } else if (params.ownerId) {
      owner = { id: params.ownerId };
    }

    let revisionFilter: any = {};
    // Do not filter on revision if we are getting a specific POS
    if (!params.posId && !params.posRevision) {
      revisionFilter.revision = Raw(alias => `${alias} = (${this.revisionSubQuery(params.containerRevision)})`);
    }

    let where: FindOptionsWhere<ContainerRevision> = {
      ...QueryFilter.createFilterWhereClause(filterMapping, params),
      ...revisionFilter,
      pointsOfSale: {
        pointOfSaleId: params.posId,
        revision: params.posRevision,
        pointOfSale: {
          deletedAt: IsNull(),
        },
      },
      container: {
        deletedAt: IsNull(),
        owner,
      },
      products: {
        product: {
          deletedAt: IsNull(),
        },
      },
    };

    const options: FindManyOptions<ContainerRevision> = {
      where,
      order: { createdAt: 'ASC' },
      withDeleted: true,
    };

    return { ...options, relations };
  }
}
