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
  Connection, getManager, IsNull, Not,
} from 'typeorm';
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
  seedContainers, seedProducts, seedPointsOfSale,
  seedProductCategories, seedUsers, seedVatGroups,
} from '../../seed';
import Container from '../../../src/entity/container/container';
import { ContainerResponse, ContainerWithProductsResponse } from '../../../src/controller/response/container-response';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import {
  CreateContainerParams,
  UpdateContainerParams,
} from '../../../src/controller/request/container-request';
import PointOfSaleService from '../../../src/service/point-of-sale-service';
import { CreatePointOfSaleParams, UpdatePointOfSaleParams } from '../../../src/controller/request/point-of-sale-request';
import AuthenticationService from '../../../src/service/authentication-service';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import sinon from 'sinon';
import { PointOfSaleWithContainersResponse } from '../../../src/controller/response/point-of-sale-response';

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
    deletedContainers: Container[],
    containerRevisions: ContainerRevision[],
    pointsOfSale: PointOfSale[],
    deletedPointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containers, containerRevisions } = await seedContainers(users, productRevisions);
    const { pointsOfSale, pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);

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
      containers: containers.filter((c) => c.deletedAt == null),
      deletedContainers: containers.filter((c) => c.deletedAt != null),
      containerRevisions,
      pointsOfSale: pointsOfSale.filter((p) => p.deletedAt == null),
      deletedPointsOfSale: pointsOfSale.filter((p) => p.deletedAt != null),
      pointOfSaleRevisions,
    };
  });

  // close database connection
  after(async () => {
    await finishTestDB(ctx.connection);
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
      const pos = ctx.pointsOfSale[0];
      const posRevision = ctx.pointOfSaleRevisions.find((r) => r.pointOfSaleId === pos.id && r.revision === pos.currentRevision);
      const { records } = await ContainerService.getContainers({
        posId: pos.id,
        posRevision: posRevision.revision,
      });

      expect(containerSuperset(records, ctx.containers)).to.be.true;

      const belongsToPos = records.every(
        (c1: ContainerResponse) => posRevision.containers.some(
          (c2: ContainerRevision) => c2.container.id === c1.id && c2.revision === c1.revision,
        ),
      );
      expect(belongsToPos).to.be.true;
      expect(posRevision.containers.filter((c) => c.container.deletedAt == null)).to.be.length(records.length);
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
      await ContainerService.createContainer(createContainerParams);
      const { records } = await ContainerService.getContainers(
        { returnProducts: true }, {},
      );
      expect(ctx.specification.validateModel('Array.<ContainerWithProductsResponse.model>', records, false, true).valid).to.be.true;
      const withRevisions = await Container.find({ where: { currentRevision: Not(IsNull()) } });
      expect(records.map((containerResponse) => containerResponse.id))
        .to.deep.equalInAnyOrder(withRevisions.map((c) => c.id));
    });
    it('should return all points of sale involving a single user and its memberAuthenticator users', async () => {
      const usersOwningACont = [...new Set(ctx.containers.map((cont) => cont.owner))];
      const owner1 = usersOwningACont[0];
      const owner2 = usersOwningACont[1];

      // Sanity check
      const memberAuthenticators = await MemberAuthenticator.find({
        where: { user: { id: owner1.id } },
      });
      expect(memberAuthenticators.length).to.equal(0);

      let containers = await ContainerService.getContainers({}, {}, owner1);
      const containersOwnedBy1 = containers.records.length;
      containers.records.forEach((cont) => {
        expect(cont.owner.id).to.equal(owner1.id);
      });
      containers = await ContainerService.getContainers({}, {}, owner2);
      const containersOwnedBy2 = containers.records.length;
      containers.records.forEach((cont) => {
        expect(cont.owner.id).to.equal(owner2.id);
      });

      await AuthenticationService.setMemberAuthenticator(
        getManager(), [owner1], owner2,
      );

      const ownerIds = [owner1, owner2].map((o) => o.id);
      containers = await ContainerService.getContainers({}, {}, owner1);
      expect(containers.records.length).to.equal(containersOwnedBy1 + containersOwnedBy2);
      containers.records.forEach((cont) => {
        expect(ownerIds).to.include(cont.owner.id);
      });

      // Cleanup
      await MemberAuthenticator.delete({ user: { id: owner1.id } });
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

  describe('updateContainer function', () => {
    it('should revise the container without creating a UpdatedContainer', async () => {
      const container = await Container.findOne({ where: {} });
      const update: UpdateContainerParams = {
        id: container.id,
        name: 'Container Update Name',
        products: [1, 2, 3],
        public: true,
      };
      const response = await ContainerService.updateContainer(update);
      responseAsUpdate(update, response);
      const entity = await Container.findOne({ where: { id: container.id } });
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

      const container = await ContainerService.createContainer(creation);
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

      // Cleanup
      await ContainerRevision.delete({ containerId: container.id });
      await Container.delete({ id: container.id });
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
      const container = await ContainerService.createContainer(createContainerParams);

      createContainerParams = {
        products: [1],
        public: true,
        name: 'New Container #2',
        ownerId,
      };
      const container2 = await ContainerService.createContainer(createContainerParams);

      const createPointOfSaleParams: CreatePointOfSaleParams = {
        containers: [container.id, container2.id],
        name: 'New POS',
        useAuthentication: true,
        ownerId,
      };
      const pos = await PointOfSaleService.createPointOfSale(createPointOfSaleParams);

      const update: UpdateContainerParams = {
        products: [1, 2],
        public: true,
        name: 'New name',
        id: container.id,
      };

      await ContainerService.updateContainer(update);

      const updatedPos = await PointOfSaleRevision
        .findOne({ where: { revision: 2, pointOfSale: { id: pos.id } }, relations: ['containers', 'containers.products'] });
      expect(updatedPos).to.not.be.null;
      expect(updatedPos.containers).length(2);

      const newContainer = updatedPos.containers.find((c) => c.container.id === container.id);
      expect(newContainer.name).to.eq(update.name);

      // Cleanup
      await PointOfSaleRevision.delete({ pointOfSaleId: pos.id });
      await PointOfSale.delete({ id: pos.id });
      await ContainerRevision.delete({ containerId: container2.id });
      await ContainerRevision.delete({ containerId: container.id });
      await Container.delete({ id: container2.id });
      await Container.delete({ id: container.id });
    });
  });
  describe('deleteContainer function', () => {
    it('should soft delete container and propagate update after deletion', async () => {
      const stub = sinon.stub(PointOfSaleService, 'updatePointOfSale').callsFake(async (params): Promise<PointOfSaleWithContainersResponse> => {
        const pointOfSale = await PointOfSaleService.getPointsOfSale({ pointOfSaleId: params.id, returnContainers: true, returnProducts: true });
        return pointOfSale.records[0] as PointOfSaleWithContainersResponse;
      });

      const start = Math.floor(new Date().getTime() / 1000) * 1000;
      const container = ctx.containers[0];
      let dbContainer = await Container.findOne({ where: { id: container.id }, withDeleted: true });
      // Sanity check
      expect(dbContainer).to.not.be.null;
      expect(dbContainer.deletedAt).to.be.null;

      await ContainerService.deleteContainer(container.id);

      dbContainer = await Container.findOne({ where: { id: container.id }, withDeleted: true });
      expect(dbContainer).to.not.be.null;
      expect(dbContainer.deletedAt).to.not.be.null;
      expect(dbContainer.deletedAt.getTime()).to.be.greaterThanOrEqual(start);

      const deletedContainers = await Container.find({ where: { deletedAt: Not(IsNull()) }, withDeleted: true });
      expect(deletedContainers.length).to.equal(ctx.deletedContainers.length + 1);

      // Propagated update
      const revision = ctx.containerRevisions.find((c) => c.containerId === container.id && c.revision == container.currentRevision);
      const pointOfSaleRevisions = ctx.pointOfSaleRevisions.filter((p) => p.containers
        .some((c) => c.revision === revision.revision && c.containerId === revision.containerId && c.container.deletedAt == null))
        .filter((p) => p.pointOfSale.deletedAt == null)
        .filter((p) => p.revision === p.pointOfSale.currentRevision);
      expect(stub.callCount).to.equal(pointOfSaleRevisions.length);
      for (let i = 0; i < stub.callCount; i += 1) {
        const call = stub.getCall(i);
        const pos = pointOfSaleRevisions[i];
        expect(call.args).to.deep.equalInAnyOrder([{
          // Include all previous containers except the just deleted container
          containers: pos.containers.filter((c) => c.container.deletedAt == null)
            .map((p) => p.containerId)
            .filter((c) => c !== container.id),
          useAuthentication: pos.useAuthentication,
          name: pos.name,
          id: pos.pointOfSaleId,
        }]);
      }

      // Revert state
      await dbContainer.recover();
      stub.restore();
    });
    it('should throw error for non existent container', async () => {
      const containerId = ctx.containers.length + ctx.deletedContainers.length + 2;
      let dbContainer = await Container.findOne({ where: { id: containerId }, withDeleted: true });
      // Sanity check
      expect(dbContainer).to.be.null;

      await expect(ContainerService.deleteContainer(containerId)).to.eventually.be.rejectedWith('Container not found');

      const deletedContainers = await Container.find({ where: { deletedAt: Not(IsNull()) }, withDeleted: true });
      expect(deletedContainers.length).to.equal(ctx.deletedContainers.length);
    });
    it('should throw error when soft deleting container twice', async () => {
      const container = ctx.containers[0];
      let dbContainer = await Container.findOne({ where: { id: container.id }, withDeleted: true });
      // Sanity check
      expect(dbContainer).to.not.be.null;
      expect(dbContainer.deletedAt).to.be.null;

      await ContainerService.deleteContainer(container.id);

      dbContainer = await Container.findOne({ where: { id: container.id }, withDeleted: true });
      expect(dbContainer).to.not.be.null;
      expect(dbContainer.deletedAt).to.not.be.null;

      await expect(ContainerService.deleteContainer(container.id)).to.eventually.be.rejectedWith('Container not found');

      // Revert state
      await dbContainer.recover();
    });
  });
});
