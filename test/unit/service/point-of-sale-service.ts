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
import User from '../../../src/entity/user/user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import UpdatedPointOfSale from '../../../src/entity/point-of-sale/updated-point-of-sale';
import Database from '../../../src/database/database';
import {
  seedAllContainers, seedAllPointsOfSale,
  seedAllProducts,
  seedProductCategories,
  seedUsers, seedVatGroups,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import {
  PaginatedPointOfSaleResponse,
  PointOfSaleResponse, PointOfSaleWithContainersResponse,
  UpdatedPointOfSaleResponse,
} from '../../../src/controller/response/point-of-sale-response';
import PointOfSaleService from '../../../src/service/point-of-sale-service';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import {
  CreatePointOfSaleParams, UpdatePointOfSaleParams,
  UpdatePointOfSaleRequest,
} from '../../../src/controller/request/point-of-sale-request';
import AuthenticationService from '../../../src/service/authentication-service';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';

chai.use(deepEqualInAnyOrder);

/**
 * Test if all the point of sale responses are part of the point of sale set array.
 * @param response
 * @param superset
 */
function pointOfSaleSuperset(response: PointOfSaleResponse[] | UpdatedPointOfSaleResponse[],
  superset: PointOfSale[]): Boolean {
  return response.every((searchPOS: PointOfSaleResponse) => (
    superset.find((supersetPOS: PointOfSale) => (
      supersetPOS.id === searchPOS.id
          && supersetPOS.owner.id === searchPOS.owner.id
    )) !== undefined
  ));
}

/**
 * Check if response adheres to update.
 */
function updateUpdatedResponseEqual(update: UpdatePointOfSaleRequest,
  response: UpdatedPointOfSaleResponse) {
  const attributes: (keyof UpdatedPointOfSaleResponse)[] = ['name'];
  attributes.forEach((attr) => (
    (expect(update[attr as keyof UpdatePointOfSaleRequest])
      .to.equal(response[attr as keyof UpdatedPointOfSaleResponse]))));
}

/**
 * Checks if response adheres to creation.
 */
function requestUpdatedResponseEqual(request: CreatePointOfSaleParams,
  response: UpdatedPointOfSaleResponse) {
  updateUpdatedResponseEqual(request, response);
  expect(request.ownerId).to.equal(response.owner.id);
}

function updateResponseEqual(update: UpdatePointOfSaleParams,
  response: PointOfSaleWithContainersResponse) {
  expect(update.id).to.equal(response.id);
  expect(update.name).to.equal(response.name);
  expect(update.containers).to.deep.equalInAnyOrder(response.containers.map((c) => c.id));
}

describe('PointOfSaleService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    pointsOfSale: PointOfSale[],
    updatedPointsOfSale: UpdatedPointOfSale[],
    validPOSParams: CreatePointOfSaleParams,
  };

  before(async function before() {
    this.timeout(5000);

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
    } = await seedAllContainers(users, productRevisions, products);
    const {
      pointsOfSale,
      updatedPointsOfSale,
    } = await seedAllPointsOfSale(users, containerRevisions, containers);

    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    const validPOSParams: CreatePointOfSaleParams = {
      containers: [containers[0].id, containers[1].id, containers[2].id],
      name: 'Valid POS',
      ownerId: 1,
    };

    ctx = {
      connection,
      app,
      specification,
      users,
      pointsOfSale,
      updatedPointsOfSale,
      validPOSParams,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('getPointsOfSale function', () => {
    it('should return all point of sales with no input specification', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = (await PointOfSaleService
        .getPointsOfSale()) as PaginatedPointOfSaleResponse;

      const withRevisions = ctx.pointsOfSale.filter((c) => c.currentRevision > 0);
      expect(records).to.be.length(withRevisions.length);
      expect(pointOfSaleSuperset(records, ctx.pointsOfSale)).to.be.true;
      expect(records.every(
        (c: PointOfSaleResponse) => ctx.specification.validateModel('PointOfSaleResponse', c, false, true).valid,
      )).to.be.true;

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(withRevisions.length);
    });
    it('should return points of sale with ownerId specified', async () => {
      const { records } = (await PointOfSaleService.getPointsOfSale({
        ownerId: ctx.pointsOfSale[0].owner.id,
      }) as PaginatedPointOfSaleResponse);

      const withRevisions = ctx.pointsOfSale.filter((c) => c.currentRevision > 0);
      expect(pointOfSaleSuperset(records, ctx.pointsOfSale)).to.be.true;
      const belongsToOwner = records.every((pointOfSale: PointOfSaleResponse) => (
        pointOfSale.owner.id === ctx.pointsOfSale[0].owner.id));
      expect(belongsToOwner).to.be.true;

      const { length } = withRevisions.filter((pointOfSale) => (
        pointOfSale.owner.id === ctx.pointsOfSale[0].owner.id));
      expect(records).to.be.length(length);
    });
    it('should return single point of sale if pointOfSaleId is specified', async () => {
      const { records } = (await PointOfSaleService.getPointsOfSale({
        pointOfSaleId: ctx.pointsOfSale[0].id,
      }) as PaginatedPointOfSaleResponse);

      expect(records).to.be.length(1);
      expect(records[0].id).to.be.equal(ctx.pointsOfSale[0].id);
    });
    it('should return no points of sale if userId and containerId do not match', async () => {
      const { records } = (await PointOfSaleService.getPointsOfSale({
        ownerId: ctx.pointsOfSale[10].owner.id,
        pointOfSaleId: ctx.pointsOfSale[0].id,
      }) as PaginatedPointOfSaleResponse);

      expect(records).to.be.length(0);
    });
    it('should adhere to pagination', async () => {
      const take = 3;
      const skip = 2;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = (await PointOfSaleService.getPointsOfSale({}, {
        take, skip,
      }) as PaginatedPointOfSaleResponse);

      const withRevisions = ctx.pointsOfSale.filter((c) => c.currentRevision > 0);
      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(withRevisions.length);
      expect(records.length).to.be.at.most(take);
    });
    it('should return all points of sale involving a single user and its memberAuthenticator users', async () => {
      const usersOwningAPos = [...new Set(ctx.pointsOfSale.map((pos) => pos.owner))];
      const owner = usersOwningAPos[0];

      // Sanity check
      const memberAuthenticators = await MemberAuthenticator.find({ where: { user: owner } });
      expect(memberAuthenticators.length).to.equal(0);

      let pointsOfSale = await PointOfSaleService.getPointsOfSale({}, {}, owner);
      const originalLength = pointsOfSale.records.length;
      pointsOfSale.records.forEach((pos) => {
        expect(pos.owner.id).to.equal(owner.id);
      });

      await AuthenticationService.setMemberAuthenticator(getManager(), [owner], usersOwningAPos[1]);

      const ownerIds = [owner, usersOwningAPos[1]].map((o) => o.id);
      pointsOfSale = await PointOfSaleService.getPointsOfSale({}, {}, owner);
      expect(pointsOfSale.records.length).to.be.greaterThan(originalLength);
      pointsOfSale.records.forEach((pos) => {
        expect(ownerIds).to.include(pos.owner.id);
      });

      // Cleanup
      await MemberAuthenticator.delete({ user: owner });
    });
  });
  describe('getUpdatedPointsOfSale function', () => {
    it('should return all updated point of sales with no input specification', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = (await PointOfSaleService
        .getUpdatedPointsOfSale() as PaginatedPointOfSaleResponse);
      expect(records.map((p) => p.id))
        .to.deep.equalInAnyOrder(ctx.updatedPointsOfSale.map((p) => p.pointOfSale.id));

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(ctx.updatedPointsOfSale.length);
    });
    it('should adhere to pagination', async () => {
      const take = 3;
      const skip = 2;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = (await PointOfSaleService.getUpdatedPointsOfSale({}, {
        take, skip,
      }) as PaginatedPointOfSaleResponse);

      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(ctx.updatedPointsOfSale.length);
      expect(records.length).to.be.at.most(take);
    });
    it('should return all points of sale involving a single user and its memberAuthenticator users', async () => {
      const usersOwningAPos = [...new Set(ctx.pointsOfSale.map((pos) => pos.owner))];
      const owner = usersOwningAPos[0];

      // Sanity check
      const memberAuthenticators = await MemberAuthenticator.find({ where: { user: owner } });
      expect(memberAuthenticators.length).to.equal(0);

      let pointsOfSale = await PointOfSaleService.getUpdatedPointsOfSale({}, {}, owner);
      const originalLength = pointsOfSale.records.length;
      pointsOfSale.records.forEach((pos) => {
        expect(pos.owner.id).to.equal(owner.id);
      });

      await AuthenticationService.setMemberAuthenticator(getManager(), [owner], usersOwningAPos[1]);

      const ownerIds = [owner, usersOwningAPos[1]].map((o) => o.id);
      pointsOfSale = await PointOfSaleService.getUpdatedPointsOfSale({}, {}, owner);
      expect(pointsOfSale.records.length).to.be.greaterThan(originalLength);
      pointsOfSale.records.forEach((pos) => {
        expect(ownerIds).to.include(pos.owner.id);
      });

      // Cleanup
      await MemberAuthenticator.delete({ user: owner });
    });
  });
  describe('createPointOfSale function', () => {
    it('should create a new PointOfSale', async () => {
      const count = await PointOfSale.count();
      const res: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.createPointOfSale(ctx.validPOSParams));

      expect(await PointOfSale.count()).to.equal(count + 1);

      const updatedPointOfSale = await UpdatedPointOfSale.findOne(res.id, { relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.id);
      expect(ctx.validPOSParams.containers).to.deep.equalInAnyOrder(containers);

      expect(updatedPointOfSale.name).to.equal(ctx.validPOSParams.name);

      requestUpdatedResponseEqual(ctx.validPOSParams, res);
    });
  });
  describe('updatePointOfSale function', () => {
    it('should create a new UpdatedPointOfSale', async () => {
      const id = 1;
      // Precondition: POS has no existing update
      expect(await UpdatedPointOfSale.findOne(id)).to.be.undefined;

      const updateParams: UpdatePointOfSaleParams = {
        containers: [1, 2, 3],
        name: 'Updated POS',
        id,
      };

      const res: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.updatePointOfSale(updateParams));

      const updatedPointOfSale = await UpdatedPointOfSale.findOne(res.id, { relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.id);
      expect(ctx.validPOSParams.containers).to.deep.equalInAnyOrder(containers);

      updateUpdatedResponseEqual(updateParams, res);
    });
    it('should replace an old update', async () => {
      const id = 6;
      // Precondition: POS has existing update
      const update = await UpdatedPointOfSale.findOne(id, { relations: ['containers'] });
      expect(update).to.not.be.undefined;

      const updateRequest: UpdatePointOfSaleParams = {
        id,
        containers: [1, 2, 3],
        name: 'Updated POS',
      };

      const res: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.updatePointOfSale(updateRequest));

      const updatedPointOfSale = await UpdatedPointOfSale.findOne(res.id, { relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.id);
      expect(ctx.validPOSParams.containers).to.deep.equalInAnyOrder(containers);

      updateUpdatedResponseEqual(updateRequest, res);
    });
  });
  describe('approvePointOfSaleUpdate function', () => {
    it('should approve a new PointOfSale update', async () => {
      const newPOS: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.createPointOfSale(ctx.validPOSParams));

      const res = ((
        (await PointOfSaleService
          .approvePointOfSaleUpdate(newPOS.id)) as any) as PointOfSaleResponse);

      const pointOfSaleRevision = await PointOfSaleRevision.findOne({ revision: res.revision, pointOfSale: { id: newPOS.id } }, { relations: ['containers'] });
      const containers = pointOfSaleRevision.containers.map((container) => container.container.id);
      expect(ctx.validPOSParams.containers).to.deep.equalInAnyOrder(containers);

      expect(res.name).to.equal(pointOfSaleRevision.name);
      expect(res.revision).to.equal(pointOfSaleRevision.revision);
    });
  });
  describe('directPointOfSaleUpdate function', () => {
    it('should revise the point of sale without creating a UpdatedPointOfSale', async () => {
      const pointOfSale = await PointOfSale.findOne();
      const update: UpdatePointOfSaleParams = {
        containers: [3],
        id: pointOfSale.id,
        name: 'Pos Updated Name',
      };

      const response = await PointOfSaleService.directPointOfSaleUpdate(update);
      updateResponseEqual(update, response);
    });
  });
});
