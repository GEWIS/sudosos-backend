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
import { Connection, getManager } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ContainerService from '../../../src/service/container-service';
import {
  seedAllContainers, seedAllProducts, seedPointsOfSale,
  seedProductCategories, seedUsers, seedVatGroups,
} from '../../seed';
import Container from '../../../src/entity/container/container';
import { ContainerResponse, ContainerWithProductsResponse } from '../../../src/controller/response/container-response';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import UpdatedContainer from '../../../src/entity/container/updated-container';
import {
  CreateContainerParams,
  UpdateContainerParams,
} from '../../../src/controller/request/container-request';
import PointOfSaleService from '../../../src/service/point-of-sale-service';
import { CreatePointOfSaleParams } from '../../../src/controller/request/point-of-sale-request';
import AuthenticationService from '../../../src/service/authentication-service';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';

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

function responseAsUpdate(update: UpdateContainerParams, response: ContainerWithProductsResponse) {
  expect(update.id).to.be.eq(response.id);
  expect(update.name).to.be.eq(response.name);
  expect(update.products).to.be.deep.equalInAnyOrder(response.products.map((p) => p.id));
}

function responseAsCreation(creation: CreateContainerParams,
  response: ContainerWithProductsResponse) {
  expect(creation.ownerId).to.be.eq(response.owner.id);
  expect(creation.name).to.be.eq(response.name);
  expect(creation.public).to.be.eq(response.public);
  expect(creation.products).to.be.deep.equalInAnyOrder(response.products.map((p) => p.id));
}

function entityAsUpdate(update: UpdateContainerParams, container: ContainerRevision) {
  expect(update.id).to.be.eq(container.container.id);
  expect(update.name).to.be.eq(container.name);
  expect(update.products).to.be.deep.equalInAnyOrder(container.products.map((p) => p.product.id));
}

async function entityAsCreation(creation: CreateContainerParams, entity: ContainerRevision) {
  const container = await Container.findOne({ where: { id: entity.container.id }, relations: ['owner'] });
  expect(creation.ownerId).to.be.eq(container.owner.id);
  expect(creation.name).to.be.eq(entity.name);
  expect(creation.public).to.be.eq(entity.container.public);
  expect(creation.products).to.be.deep.equalInAnyOrder(entity.products.map((p) => p.product.id));
}

chai.use(deepEqualInAnyOrder);

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
    const vatGroups = await seedVatGroups();
    const {
      products,
      productRevisions,
    } = await seedAllProducts(users, categories, vatGroups);
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
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('updateContainer function', () => {
    it('should return undefined is base is not defined', async () => {
      const update: UpdateContainerParams = {
        id: 0,
        name: 'Container',
        products: [],
        public: true,
      };
      const container = await ContainerService.updateContainer(update);
      expect(container).to.be.undefined;
    });
  });

  describe('getContainers function', () => {
    it('should return all containers with no input specification', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ContainerService.getContainers();

      const withRevisions = ctx.containers.filter((c) => c.currentRevision > 0);
      expect(records).to.be.length(withRevisions.length);
      expect(containerSuperset(records, ctx.containers)).to.be.true;
      records.forEach((c) => {
        const validator = ctx.specification.validateModel('ContainerResponse', c, false, true);
        expect(validator.valid).to.be.true;
      });

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
      const createContainerParams: CreateContainerParams = {
        name: 'Empty Container',
        ownerId: (await User.findOne({ where: { deleted: false, type: UserType.ORGAN } })).id,
        products: [],
        public: true,
      };
      await ContainerService.createContainer(createContainerParams, true);
      const { records } = await ContainerService.getContainers(
        { returnProducts: true }, {},
      );
      expect(ctx.specification.validateModel('Array.<ContainerWithProductsResponse.model>', records, false, true).valid).to.be.true;
      const withRevisions = await Container.find({ where: 'currentRevision' });
      expect(records.map((containerResponse) => containerResponse.id))
        .to.deep.equalInAnyOrder(withRevisions.map((c) => c.id));
    });
    it('should return all points of sale involving a single user and its memberAuthenticator users', async () => {
      const usersOwningACont = [...new Set(ctx.containers.map((cont) => cont.owner))];
      const owner = usersOwningACont[0];

      // Sanity check
      const memberAuthenticators = await MemberAuthenticator.find({ where: { user: owner } });
      expect(memberAuthenticators.length).to.equal(0);

      let container = await ContainerService.getContainers({}, {}, owner);
      const originalLength = container.records.length;
      container.records.forEach((cont) => {
        expect(cont.owner.id).to.equal(owner.id);
      });

      await AuthenticationService.setMemberAuthenticator(
        getManager(), [owner], usersOwningACont[1],
      );

      const ownerIds = [owner, usersOwningACont[1]].map((o) => o.id);
      container = await ContainerService.getContainers({}, {}, owner);
      expect(container.records.length).to.be.greaterThan(originalLength);
      container.records.forEach((cont) => {
        expect(ownerIds).to.include(cont.owner.id);
      });

      // Cleanup
      await MemberAuthenticator.delete({ user: owner });
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
    it('should return all points of sale involving a single user and its memberAuthenticator users', async () => {
      const usersOwningACont = [...new Set(ctx.containers.map((cont) => cont.owner))];
      const owner = usersOwningACont[0];

      // Sanity check
      const memberAuthenticators = await MemberAuthenticator.find({ where: { user: owner } });
      expect(memberAuthenticators.length).to.equal(0);

      let container = await ContainerService.getUpdatedContainers({}, {}, owner);
      const originalLength = container.records.length;
      container.records.forEach((cont) => {
        expect(cont.owner.id).to.equal(owner.id);
      });

      await AuthenticationService.setMemberAuthenticator(
        getManager(), [owner], usersOwningACont[1],
      );

      const ownerIds = [owner, usersOwningACont[1]].map((o) => o.id);
      container = await ContainerService.getUpdatedContainers({}, {}, owner);
      expect(container.records.length).to.be.greaterThan(originalLength);
      container.records.forEach((cont) => {
        expect(ownerIds).to.include(cont.owner.id);
      });

      // Cleanup
      await MemberAuthenticator.delete({ user: owner });
    });
  });

  describe('canViewContainer function', () => {
    it('should return true if the container is public', async () => {
      // Sanity check
      expect(ctx.containers[0].public).to.be.true;
      const user = ctx.containers[0].owner.id + 1;

      expect((await ContainerService.canViewContainer(user, ctx.containers[0]))
        .public).to.be.true;
    });
    it('should return true if the user is the owner of private container', async () => {
      const container = await Container.findOne({ where: { public: false }, relations: ['owner'] });
      expect((await ContainerService.canViewContainer(
        container.owner.id, container,
      )).own).to.be.true;
    });
    it('should return false if the user is not the owner and container is private', async () => {
      const container = await Container.findOne({ where: { public: false }, relations: ['owner'] });
      expect(container.public).to.be.false;
      const visibility = await ContainerService.canViewContainer(
        container.owner.id + 1, container,
      );
      expect(visibility.own).to.be.false;
      expect(visibility.public).to.be.false;
    });
  });

  describe('directContainerUpdate function', () => {
    it('should revise the container without creating a UpdatedContainer', async () => {
      const container = await Container.findOne();
      const update: UpdateContainerParams = {
        id: container.id,
        name: 'Container Update Name',
        products: [1, 2, 3],
        public: true,
      };
      const response = await ContainerService.directContainerUpdate(update);
      responseAsUpdate(update, response);
      const entity = await Container.findOne({ id: container.id });
      const revision = await ContainerRevision.findOne({ where: { container: { id: container.id }, revision: entity.currentRevision }, relations: ['container', 'products', 'products.product'] });
      entityAsUpdate(update, revision);
    });
  });

  describe('createContainer function', () => {
    it('should create the container without update if approve is true', async () => {
      const creation: CreateContainerParams = {
        ownerId: (await User.findOne({ where: { deleted: false } })).id,
        name: 'Container Update Name',
        products: [1, 2, 3],
        public: true,
      };

      const container = await ContainerService.createContainer(creation, true);
      responseAsCreation(creation, container);
      const entity = await Container.findOne({ where: { id: container.id } });
      const revision = await ContainerRevision.findOne({
        where: {
          container: { id: container.id },
          revision: entity.currentRevision,
        },
        relations: ['container', 'products', 'products.product', 'container.owner'],
      });
      await entityAsCreation(creation, revision);
    });
  });

  describe('propagateContainerUpdate function', () => {
    it('should update all POS that include given container', async () => {
      const ownerId = (await User.findOne({ where: { deleted: false } })).id;
      let createContainerParams: CreateContainerParams = {
        products: [1],
        public: true,
        name: 'New Container',
        ownerId,
      };
      const container = await ContainerService.createContainer(createContainerParams, true);

      createContainerParams = {
        products: [1],
        public: true,
        name: 'New Container #2',
        ownerId,
      };
      const container2 = await ContainerService.createContainer(createContainerParams, true);

      const createPointOfSaleParams: CreatePointOfSaleParams = {
        containers: [container.id, container2.id],
        name: 'New POS',
        useAuthentication: true,
        ownerId,
      };
      const pos = await PointOfSaleService.createPointOfSale(createPointOfSaleParams, true);

      const update: UpdateContainerParams = {
        products: [1, 2],
        public: true,
        name: 'New name',
        id: container.id,
      };

      await ContainerService.directContainerUpdate(update);

      const updatedPos = await PointOfSaleRevision
        .findOne({ where: { revision: 2, pointOfSale: { id: pos.id } }, relations: ['containers', 'containers.products'] });
      expect(updatedPos).to.not.be.undefined;
      expect(updatedPos.containers).length(2);

      const newContainer = updatedPos.containers.find((c) => c.container.id === container.id);
      expect(newContainer.name).to.eq(update.name);
    });
  });
});
