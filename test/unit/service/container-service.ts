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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect } from 'chai';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ContainerService from '../../../src/service/container-service';
import {
  seedAllContainers, seedAllProducts, seedPointsOfSale, seedProductCategories, seedUsers,
} from '../../seed';
import Container from '../../../src/entity/container/container';
import { ContainerResponse } from '../../../src/controller/response/container-response';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import UpdatedContainer from '../../../src/entity/container/updated-container';

/**
 * Test if all the container responses are part of the container set array.
 * @param response
 * @param superset
 */
function containerSuperset(response: ContainerResponse[], superset: Container[]): Boolean {
  return response.every((searchContainer: ContainerResponse) => (
    superset.find((supersetContainer: Container) => (
      supersetContainer.id === searchContainer.id
          && supersetContainer.owner.id === searchContainer.owner.id
    )) !== undefined
  ));
}

describe('ContainerService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    containers: Container[],
    updatedContainers: UpdatedContainer[]
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const {
      products,
      productRevisions,
    } = await seedAllProducts(users, categories);
    const {
      containers,
      containerRevisions,
      updatedContainers,
    } = await seedAllContainers(users, productRevisions, products);
    await seedPointsOfSale(users, containerRevisions);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      containers,
      updatedContainers,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  describe('getContainers function', () => {
    it('should return all containers with no input specification', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ContainerService.getContainers();

      const withRevisions = ctx.containers.filter((c) => c.currentRevision > 0);
      expect(records).to.be.length(withRevisions.length);
      expect(containerSuperset(records, ctx.containers)).to.be.true;
      expect(records.every(
        (c: ContainerResponse) => ctx.specification.validateModel('ContainerResponse', c, false, true).valid,
      )).to.be.true;

      expect(_pagination.take).to.equal(undefined);
      expect(_pagination.skip).to.equal(undefined);
      expect(_pagination.count).to.equal(withRevisions.length);
    });
    it('should return containers with the ownerId specified', async () => {
      const { records } = await ContainerService.getContainers({
        ownerId: ctx.containers[0].owner.id,
      });

      expect(containerSuperset(records, ctx.containers)).to.be.true;

      const belongsToOwner = records.every((container: ContainerResponse) => (
        container.owner.id === ctx.containers[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return containers of the point of sale specified', async () => {
      const pos: PointOfSaleRevision = await PointOfSaleRevision.findOne({
        relations: ['pointOfSale', 'containers'],
      });
      const { records } = await ContainerService.getContainers({
        posId: pos.pointOfSale.id,
        posRevision: pos.revision,
      });

      expect(containerSuperset(records, ctx.containers)).to.be.true;

      const belongsToPos = records.every(
        (c1: ContainerResponse) => pos.containers.some(
          (c2: ContainerRevision) => c2.container.id === c1.id && c2.revision === c1.revision,
        ),
      );
      expect(belongsToPos).to.be.true;
      expect(pos.containers).to.be.length(records.length);
    });
    it('should return a single container if containerId is specified', async () => {
      const { records } = await ContainerService.getContainers({
        containerId: ctx.containers[0].id,
      });

      expect(records).to.be.length(1);
      expect(records[0].id).to.be.equal(ctx.containers[0].id);
    });
    it('should return no containers if the userId and containerId dont match', async () => {
      const { records } = await ContainerService.getContainers({
        ownerId: ctx.containers[10].owner.id,
        containerId: ctx.containers[0].id,
      });

      expect(records).to.be.length(0);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ContainerService.getContainers({}, {
        take, skip,
      });

      const withRevisions = ctx.containers.filter((c) => c.currentRevision > 0);
      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(withRevisions.length);
      expect(records.length).to.equal(take);
    });
    it('should return products if specified', async () => {
      const { records } = await ContainerService.getContainers(
        { returnProducts: true }, {},
      );
      console.error(records);
    });
  });

  describe('getUpdatedContainers function', () => {
    it('should return all updated containers with no input specification', async () => {
      const { records } = await ContainerService.getUpdatedContainers();

      expect(records.every(
        (c1: ContainerResponse) => ctx.updatedContainers.some((c2) => c1.id === c2.container.id),
      )).to.be.true;
      expect(records.every(
        (c: ContainerResponse) => ctx.specification.validateModel('ContainerResponse', c, false, true).valid,
      )).to.be.true;
    });
    it('should return updated containers with the ownerId specified', async () => {
      const { records } = await ContainerService.getUpdatedContainers({
        ownerId: ctx.containers[0].owner.id,
      });

      expect(
        records.every(
          (c1: ContainerResponse) => ctx.updatedContainers.some((c2) => c1.id === c2.container.id),
        ),
      ).to.be.true;

      const belongsToOwner = records.every((container: ContainerResponse) => (
        container.owner.id === ctx.containers[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return a single updated container if containerId is specified', async () => {
      const { records } = await ContainerService.getUpdatedContainers({
        containerId: ctx.updatedContainers[0].container.id,
      });

      expect(records).to.be.length(1);
      expect(records[0].id).to.be.equal(ctx.updatedContainers[0].container.id);
    });
    it('should return no containers if the userId and containerId dont match', async () => {
      const { records } = await ContainerService.getUpdatedContainers({
        ownerId: ctx.updatedContainers[10].container.owner.id,
        containerId: ctx.updatedContainers[0].container.id,
      });

      expect(records).to.be.length(0);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ContainerService.getUpdatedContainers({}, {
        take, skip,
      });

      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(ctx.updatedContainers.length);
      expect(records.length).to.equal(take);
    });
  });

  describe('canViewContainer function', () => {
    it('should return true if the container is public', async () => {
      // Sanity check
      expect(ctx.containers[0].public).to.be.true;
      const user = ctx.containers[0].owner.id + 1;

      expect((await ContainerService.canViewContainer(user, ctx.containers[0].id))
        .public).to.be.true;
    });
    it('should return true if the user is the owner of private container', async () => {
      const container = await Container.findOne({ where: { public: false }, relations: ['owner'] });
      expect((await ContainerService.canViewContainer(
        container.owner.id, container.id,
      )).own).to.be.true;
    });
    it('should return false if the user is not the owner and container is private', async () => {
      const container = await Container.findOne({ where: { public: false }, relations: ['owner'] });
      expect(ctx.containers[1].public).to.be.false;
      const visibility = await ContainerService.canViewContainer(
        container.owner.id + 1, container.id,
      );
      expect(visibility.own).to.be.false;
      expect(visibility.public).to.be.false;
    });
  });
});
