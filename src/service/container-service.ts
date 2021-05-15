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
import { ContainerResponse } from '../controller/response/container-response';
import Container from '../entity/container/container';
import ContainerRevision from '../entity/container/container-revision';
import UpdatedContainer from '../entity/container/updated-container';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import User from '../entity/user/user';

export default class ContainerService {
  /**
   * Helper function for the base mapping the raw getMany response container.
   * @param rawContainer - the raw response to parse.
   */
  public static getDefaultMapping(rawContainer: any) {
    return {
      id: rawContainer.container_id,
      createdAt: rawContainer.container_createdAt,
      owner: {
        id: rawContainer.owner_id,
        firstName: rawContainer.owner_firstName,
        lastName: rawContainer.owner_lastName,
      },
    };
  }

  /**
   * Query for getting all containers based on user.
   * @param owner - If specified, only return containers belonging to this owner.
   * @param containerId - If specified, only return the container with id containerId.
   * @param pos - If specified, only return the containers belonging to the point of sale.
   */
  public static async getContainers(
    owner: User = null,
    containerId: number = null,
    pos: PointOfSaleRevision = null,
  ) : Promise<ContainerResponse[]> {
    let onlyCurrent = true;
    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoin(
        ContainerRevision,
        'containerrevision',
        'container.id = containerrevision.container',
      )
      .innerJoin('container.owner', 'owner')
      .select([
        'container.id',
        'container.createdAt',
        'containerrevision.updatedAt',
        'containerrevision.revision',
        'containerrevision.name',
        'owner.id',
        'owner.firstName',
        'owner.lastName',
      ]);

    if (owner !== null) {
      builder.andWhere('container.owner = :owner', { owner: owner.id });
    }
    if (containerId !== null) {
      builder.andWhere('container.id = :containerId', { containerId });
    }
    if (pos !== null) {
      onlyCurrent = false;
      builder.innerJoin(
        (qb: SelectQueryBuilder<any>) => qb.from(PointOfSaleRevision, 'pos_revision')
          .innerJoin(
            'pos_revision.containers',
            'cc',
          )
          .where(
            'pos_revision.pointOfSaleId = :id AND pos_revision.revision = :revision',
            { id: pos.pointOfSale.id, revision: pos.revision },
          )
          .select(['cc.containerId AS id', 'cc.revision AS revision']),
        'pos_container',
        'pos_container.id = container.id AND pos_container.revision = containerrevision.revision',
      );
    }
    if (onlyCurrent) {
      builder.andWhere('container.currentRevision = containerrevision.revision');
    }

    const rawContainers = await builder.getRawMany();

    const mapping = (rawContainer: any) => ({
      name: rawContainer.containerrevision_name,
      revision: rawContainer.containerrevision_revision,
      updatedAt: rawContainer.containerrevision_updatedAt,
    });

    return rawContainers.map((rawContainer) => (
      ({ ...this.getDefaultMapping(rawContainer), ...mapping(rawContainer) } as ContainerResponse)
    ));
  }

  /**
   * Query to return all updated containers.
   * @param owner - If specified it will only return containers who has the owner Owner.
   */
  public static async getUpdatedContainers(owner: User = null): Promise<ContainerResponse[]> {
    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoinAndSelect(
        UpdatedContainer,
        'updatedcontainer',
        'container.id = updatedcontainer.container',
      )
      .innerJoinAndSelect('container.owner', 'owner')
      .innerJoinAndSelect('updatedcontainer.category', 'category')
      .select([
        'container.id',
        'container.createdAt',
        'updatedcontainer.updatedAt',
        'container.currentRevision',
        'updatedcontainer.name',
        'owner.id',
        'owner.firstName',
        'owner.lastName',
      ]);
    if (owner !== null) {
      builder.where('container.owner = :owner', { owner: owner.id });
    }

    const rawContainers = await builder.getRawMany();

    const mapping = (rawContainer: any) => ({
      name: rawContainer.updatedcontainer_name,
      revision: rawContainer.container_currentRevision,
      updatedAt: rawContainer.updatedcontainer_updatedAt,
    });

    return rawContainers.map((rawContainer) => (
      ({ ...this.getDefaultMapping(rawContainer), ...mapping(rawContainer) } as ContainerResponse)
    ));
  }
}
