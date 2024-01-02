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
  ContainerResponse,
  ContainerWithProductsResponse,
  PaginatedContainerResponse,
  PaginatedContainerWithProductResponse,
} from '../controller/response/container-response';
import Container from '../entity/container/container';
import ContainerRevision from '../entity/container/container-revision';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import { PaginationParameters } from '../helpers/pagination';
import {
  CreateContainerParams,
  UpdateContainerParams,
  UpdateContainerRequest,
} from '../controller/request/container-request';
import ProductImage from '../entity/file/product-image';
import User from '../entity/user/user';
import { UpdatePointOfSaleParams } from '../controller/request/point-of-sale-request';
// eslint-disable-next-line import/no-cycle
import PointOfSaleService from './point-of-sale-service';
// eslint-disable-next-line import/no-cycle
import ProductService from './product-service';
import AuthenticationService from './authentication-service';

interface ContainerVisibility {
  own: boolean;
  public: boolean;
}

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
  returnProducts?: boolean;
  productId?: number;
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
      id: rawContainer.container_id,
      revision: rawContainer.container_revision,
      name: rawContainer.container_name,
      createdAt: rawContainer.container_createdAt instanceof Date ? rawContainer.container_createdAt.toISOString() : rawContainer.container_createdAt,
      updatedAt: rawContainer.container_updatedAt instanceof Date ? rawContainer.container_updatedAt.toISOString() : rawContainer.container_updatedAt,
      public: !!rawContainer.container_public,
      owner: {
        id: rawContainer.owner_id,
        firstName: rawContainer.owner_firstName,
        lastName: rawContainer.owner_lastName,
      },
    };
  }

  private static async buildGetContainersQuery(filters: ContainerParameters = {}, user?: User)
    : Promise<SelectQueryBuilder<Container>> {
    const selection = [
      'container.id AS container_id',
      'container.public as container_public',
      'container.createdAt AS container_createdAt',
      'containerrevision.revision AS container_revision',
      'containerrevision.updatedAt AS container_updatedAt',
      'containerrevision.name AS container_name',
      'container_owner.id AS owner_id',
      'container_owner.firstName AS owner_firstName',
      'container_owner.lastName AS owner_lastName',
    ];

    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoin(
        ContainerRevision,
        'containerrevision',
        'container.id = containerrevision.container',
      )
      .innerJoin('container.owner', 'container_owner')
      .select(selection);

    const {
      posId, posRevision, returnProducts, ...p
    } = filters;

    if (posId !== undefined) {
      builder.innerJoin(
        (qb: SelectQueryBuilder<any>) => qb.from(PointOfSaleRevision, 'pos_revision')
          .innerJoin(
            'pos_revision.containers',
            'cc',
          )
          .where(
            `pos_revision.pointOfSaleId = ${posId} AND pos_revision.revision IN ${posRevision ? `(${posRevision})` : qb.subQuery()
              .from(PointOfSale, 'pos')
              .select('pos.currentRevision')
              .where(`pos.id = ${posId}`)
              .getSql()}`,
          )
          .select(['cc.containerId AS id', 'cc.revision AS revision']),
        'pos_container',
        'pos_container.id = container.id AND pos_container.revision = containerrevision.revision',
      );
    }

    if (returnProducts || filters.productId) {
      builder.leftJoinAndSelect('containerrevision.products', 'products');
      builder.leftJoinAndSelect('products.category', 'category');
      builder.leftJoin(Product, 'base_product', 'base_product.id = products.productId');
      builder.leftJoinAndSelect(User, 'product_owner', 'product_owner.id = base_product.owner.id');
      builder.leftJoinAndSelect(ProductImage, 'product_image', 'product_image.id = base_product.imageId');
      builder.leftJoinAndSelect('products.vat', 'vat');
      if (filters.productId) builder.where(`products.productId = ${filters.productId}`);
    }

    const filterMapping: FilterMapping = {
      containerId: 'container.id',
      containerRevision: 'containerrevision.revision',
      ownerId: 'ownerId',
      public: 'container.public',
    };

    QueryFilter.applyFilter(builder, filterMapping, p);

    if (!(posId || p.containerRevision)) {
      builder.andWhere('container.currentRevision = containerrevision.revision');
    }

    if (user) {
      const organIds = (await AuthenticationService.getMemberAuthenticators(user)).map((u) => u.id);
      builder.andWhere('container_owner.id IN (:...organIds)', { organIds });
    }

    builder.orderBy({ 'container.id': 'DESC' });

    return builder;
  }

  /**
   * Combines the database result products and containers into a ContainerWithProductsResponse
   * @param rawResponse - The SQL result to combine
   */
  private static async combineProducts(rawResponse: any[])
    : Promise<ContainerWithProductsResponse[]> {
    const collected: ContainerWithProductsResponse[] = [];
    const mapping = new Map<string, ContainerWithProductsResponse>();
    rawResponse.forEach((response) => {
      // Use a string of revision + id as key
      const key = JSON.stringify({
        revision: response.container_revision,
        id: response.container_id,
      });

      const rawProduct = {
        id: response.products_productId,
        revision: response.products_revision,
        alcoholpercentage: response.products_alcoholPercentage,
        vat_id: response.products_vatId,
        vat_hidden: !!response.vat_hidden,
        vat_percentage: response.vat_percentage,
        category_id: response.products_categoryId,
        category_name: response.category_name,
        createdAt: response.products_createdAt,
        updatedAt: response.products_updatedAt,
        owner_id: response.product_owner_id,
        owner_firstName: response.product_owner_firstName,
        owner_lastName: response.product_owner_lastName,
        image: response.product_image_downloadName,
        name: response.products_name,
        priceInclVat: response.products_priceInclVat,
      };

      // Container is empty
      if (rawProduct.id === null) {
        const containerWithProductsResponse: ContainerWithProductsResponse = {
          ...this.asContainerResponse(response),
          products: [],
        };

        mapping.set(key, containerWithProductsResponse);
      } else {
        const productResponse = ProductService.asProductResponse(rawProduct);

        if (mapping.has(key)) {
          mapping.get(key).products.push(productResponse);
        } else {
          const containerWithProductsResponse: ContainerWithProductsResponse = {
            ...this.asContainerResponse(response),
            products: [productResponse],
          };

          mapping.set(key, containerWithProductsResponse);
        }
      }
    });
    mapping.forEach((entry) => {
      collected.push(entry);
    });
    return collected;
  }

  /**
   * Query for getting all containers.
   * @param filters
   * @param pagination
   * @param user
   */
  public static async getContainers(
    filters: ContainerParameters = {}, pagination: PaginationParameters = {}, user?: User,
  ): Promise<PaginatedContainerResponse | PaginatedContainerWithProductResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      (await this.buildGetContainersQuery(filters, user)).limit(take).offset(skip).getRawMany(),
      (await this.buildGetContainersQuery({ ...filters, returnProducts: false }, user)).getCount(),
    ]);

    let records;
    if (filters.returnProducts) {
      records = await this.combineProducts(results[0]);
    } else {
      records = results[0].map((rawContainer) => this.asContainerResponse(rawContainer));
    }

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Creates a new container.
   *
   * If approve is false then the newly created container resides in the Container table and has no
   * current revision. To confirm the revision the update has to be accepted.
   *
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

    return this.directContainerUpdate(update);
  }

  public static async applyContainerUpdate(base: Container, updateRequest: UpdateContainerRequest) {
    // Get the latest products
    const products = await Product.findByIds(updateRequest.products);

    // Get the product id's for this update.
    const productIds: { revision: number, product: { id : number } }[] = (
      products.map((product) => (
        { revision: product.currentRevision, product: { id: product.id } })));

    const productRevisions: ProductRevision[] = await ProductRevision.findByIds(productIds);

    // Set base container and apply new revision.
    const containerRevision: ContainerRevision = Object.assign(new ContainerRevision(), {
      container: base,
      products: productRevisions,
      name: updateRequest.name,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
    });

    // First save revision.
    await ContainerRevision.save(containerRevision);

    // Increment current revision.
    // eslint-disable-next-line no-param-reassign
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    // eslint-disable-next-line no-param-reassign
    base.public = updateRequest.public;
    await base.save();
    await this.propagateContainerUpdate(base.id);
  }

  /**
   * Updates a container by directly creating a revision.
   * @param update - The container update
   */
  public static async directContainerUpdate(update: UpdateContainerParams)
    : Promise<ContainerWithProductsResponse> {
    const base: Container = await Container.findOne({ where: { id: update.id } });
    await this.applyContainerUpdate(base, update);
    return (this.getContainers({ containerId: base.id, returnProducts: true })
      .then((c) => c.records[0])) as Promise<ContainerWithProductsResponse>;
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
    const currentContainer = await Container.findOne({ where: { id: containerId } });
    const containerRevisions = await ContainerRevision.find({
      where: { container: { id: containerId }, revision: currentContainer.currentRevision - 1 },
      relations: ['container', 'pointsOfSale', 'pointsOfSale.pointOfSale', 'pointsOfSale.containers', 'pointsOfSale.containers.container'],
    });
    const pos = containerRevisions
      .map((c) => c.pointsOfSale)
      .reduce((a, b) => a.concat(b), [])
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
        containers: containers.map((c) => c.container.id),
        useAuthentication: p.useAuthentication,
        name: p.name,
        id: p.pointOfSale.id,
      };
      // eslint-disable-next-line no-await-in-loop
      await PointOfSaleService.directPointOfSaleUpdate(update);
    }
  }

  /**
   * Test to see if the user can view a specified container
   * @param userId - The User to test
   * @param containerId - The container to view
   */
  public static async canViewContainer(userId: number, container: Container)
    : Promise<ContainerVisibility> {
    const result: ContainerVisibility = { own: false, public: false };
    if (!container) return result;
    if (container.owner.id === userId) result.own = true;
    if (container.public) result.public = true;
    return result;
  }
}
