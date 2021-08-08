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
    };
    QueryFilter.applyFilter(builder, filterMapping, p);
    if (!(posId || p.containerRevision)) {
      builder.andWhere('container.currentRevision = containerrevision.revision');
    }

    const rawContainers = await builder.getRawMany();

    return rawContainers.map((rawContainer) => this.asContainerResponse(rawContainer));
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
    };
    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawContainers = await builder.getRawMany();

    return rawContainers.map((rawContainer) => (this.asContainerResponse(rawContainer)));
  }
}
