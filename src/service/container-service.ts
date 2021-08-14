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
import { ContainerResponse, ContainerWithProductsResponse } from '../controller/response/container-response';
import Container from '../entity/container/container';
import ContainerRevision from '../entity/container/container-revision';
import UpdatedContainer from '../entity/container/updated-container';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ProductService from './product-service';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import ContainerRequest from '../controller/request/container-request';
import User from '../entity/user/user';
import Product from '../entity/product/product';
import UpdatedProduct from '../entity/product/updated-product';

/**
 * Define updated container filtering parameters used to filter query results.
 */
export interface UpdatedContainerParameters {
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
}

/**
 * Define container filtering parameters used to filter query results.
 */
export interface ContainerParameters extends UpdatedContainerParameters {
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
}

export default class ContainerService {
  /**
   * Helper function for the base mapping the raw getMany response container.
   * @param rawContainer - the raw response to parse.
   */
  private static asContainerResponse(rawContainer: any): ContainerResponse {
    return {
      id: rawContainer.id,
      revision: rawContainer.revision,
      name: rawContainer.name,
      createdAt: rawContainer.createdAt,
      updatedAt: rawContainer.updatedAt,
      public: rawContainer.public,
      owner: {
        id: rawContainer.owner_id,
        firstName: rawContainer.owner_firstName,
        lastName: rawContainer.owner_lastName,
      },
    };
  }

  /**
   * Helper function for the base mapping the raw getMany response container.
   * @param rawContainer - the raw response to parse.
   */
  private static asContainerWithProductsResponse(rawContainer: any): ContainerWithProductsResponse {
    return {
      id: rawContainer.id,
      name: rawContainer.name,
      createdAt: rawContainer.createdAt,
      updatedAt: rawContainer.updatedAt,
      public: rawContainer.public,
      owner: {
        id: rawContainer.owner_id,
        firstName: rawContainer.owner_firstName,
        lastName: rawContainer.owner_lastName,
      },
      products: rawContainer.products.map(
        (product: any) => ProductService.asProductResponse(product),
      ),
    };
  }

  /**
   * Query for getting all containers based on user.
   * @param params
   */
  public static async getContainers(params: ContainerParameters = {})
    : Promise<ContainerResponse[]> {
    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoin(
        ContainerRevision,
        'containerrevision',
        'container.id = containerrevision.container',
      )
      .innerJoin('container.owner', 'owner')
      .select([
        'container.id AS id',
        'container.public as public',
        'container.createdAt AS createdAt',
        'containerrevision.revision AS revision',
        'containerrevision.updatedAt AS updatedAt',
        'containerrevision.name AS name',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    const { posId, posRevision, ...p } = params;

    if (posId !== undefined) {
      builder.innerJoin(
        (qb: SelectQueryBuilder<any>) => qb.from(PointOfSaleRevision, 'pos_revision')
          .innerJoin(
            'pos_revision.containers',
            'cc',
          )
          .where(
            'pos_revision.pointOfSaleId = :id AND pos_revision.revision = :revision',
            {
              id: posId,
              revision: posRevision ?? qb.subQuery()
                .from(PointOfSale, 'pos')
                .select('pos.currentRevision')
                .where('pos.id = :id', { posId })
                .getQuery(),
            },
          )
          .select(['cc.containerId AS id', 'cc.revision AS revision']),
        'pos_container',
        'pos_container.id = container.id AND pos_container.revision = containerrevision.revision',
      );
    }

    const filterMapping: FilterMapping = {
      containerId: 'container.id',
      containerRevision: 'containerrevision.revision',
      ownerId: 'owner.id',
      public: 'container.public',
    };
    QueryFilter.applyFilter(builder, filterMapping, p);
    if (!(posId || p.containerRevision)) {
      builder.andWhere('container.currentRevision = containerrevision.revision');
    }

    const rawContainers = await builder.getRawMany();

    return rawContainers.map((rawContainer) => this.asContainerResponse(rawContainer));
  }

  /**
   * Function that returns all the containers visible to a user.
   * @param params
   */
  public static async getContainersInUserContext(params: ContainerParameters): Promise<ContainerResponse[]> {
    const publicContainers: ContainerResponse[] = await this.getContainers({ ...params, ownerId: undefined, public: true } as ContainerParameters);
    const ownContainers: ContainerResponse[] = await this.getContainers({ ...params, public: false } as ContainerParameters);
    return publicContainers.concat(ownContainers);
  }

  /**
   * Query to return all updated containers.
   * @param params
   */
  public static async getUpdatedContainers(
    params: UpdatedContainerParameters = {},
  ): Promise<ContainerResponse[]> {
    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoinAndSelect(
        UpdatedContainer,
        'updatedcontainer',
        'container.id = updatedcontainer.containerId',
      )
      .innerJoinAndSelect('container.owner', 'owner')
      .select([
        'container.id AS id',
        'container.public as public',
        'container.createdAt AS createdAt',
        'updatedcontainer.updatedAt AS updatedAt',
        'updatedcontainer.name AS name',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    const filterMapping: FilterMapping = {
      containerId: 'container.id',
      containerRevision: 'containerrevision.revision',
      ownerId: 'owner.id',
      public: 'container.public',
    };
    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawContainers = await builder.getRawMany();

    return rawContainers.map((rawContainer) => (this.asContainerResponse(rawContainer)));
  }

  /**
   * Creates a new container.
   *
   * The newly created container resides in the Container table and has no
   * current revision. To confirm the revision the update has to be accepted.
   *
   * @param owner - The user that created the container.
   * @param container - The container to be created.
   */
  public static async createContainer(owner: User, container: ContainerRequest)
    : Promise<ContainerWithProductsResponse> {
    const base = Object.assign(new Container(), {
      owner,
      public: container.public,
    });

    // Save the base.
    await base.save();

    // Set base container and apply new update.
    const updatedContainer = Object.assign(new UpdatedContainer(), {
      container: await Container.findOne(base.id),
      name: container.name,
      products: container.products,
    });

    // Save update
    await updatedContainer.save();
    const update: ContainerResponse = (await this.getUpdatedContainers({ containerId: base.id }))[0];

    const containerResponse: ContainerWithProductsResponse = update as ContainerWithProductsResponse;
    containerResponse.products = await ProductService.getUpdatedProducts({ containerId: base.id });

    return containerResponse;
  }

  /**
   * Confirms an container update and creates a container revision.
   * @param containerId - The container update to confirm.
   */
  public static async approveContainerUpdate(containerId: number): Promise<ContainerWithProductsResponse> {
    const base: Container = await Container.findOne(containerId);
    const rawContainerUpdate = await UpdatedContainer.findOne(containerId);

    // return undefined if not found or request is invalid
    if (!base || !rawContainerUpdate) {
      return undefined;
    }

    // Get the product id's for this update.
    const builder = createQueryBuilder()
      .from(UpdatedContainer, 'container')
      .where('container.container.id = :id', { id: containerId })
      .innerJoinAndSelect('container.products', 'product')
      .select('product.id');

    const products = (await builder.getRawMany()).map((product: any) => product.product_id);

    // Set base container and apply new revision.
    const containerRevision: ContainerRevision = Object.assign(new ContainerRevision(), {
      container: base,
      products,
      name: base.name,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
    });

    // First save revision.
    await ContainerRevision.save(containerRevision);

    // Increment current revision.
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();

    // Remove update after revision is created.
    await UpdatedContainer.delete(containerId);

    // Return the new container with products.
    const update: ContainerResponse = (await this.getContainers({ containerId: base.id }))[0];

    const containerResponse: ContainerWithProductsResponse = update as ContainerWithProductsResponse;
    containerResponse.products = await ProductService.getUpdatedProducts({ containerId: base.id });

    return containerResponse;
  }

  /**
   * Verifies whether the container request translates to a valid container
   * @param {ContainerRequest.model} containerRequest - the container request to verify
   * @returns {boolean} - whether container is ok or not
   */
  public static async verifyContainer(containerRequest: ContainerRequest) {
    return containerRequest.name !== ''
        && containerRequest.products.every(async (productId) => {
          await Product.findOne(productId, { where: 'currentRevision' });
        });
  }

  /**
   * Test to see if the user can view a specified container
   * @param userId - The User to test
   * @param containerId - The container to view
   */
  public static async canViewContainer(userId: number, containerId: number): Promise<boolean> {
    const container: ContainerResponse[] = (await this.getContainers({ containerId }));
    if (container.length === 0) return false;
    return container[0].owner.id === userId || container[0].public;
  }
}
