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
  seedUsers,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import {
  PaginatedPointOfSaleResponse,
  PointOfSaleResponse,
  UpdatedPointOfSaleResponse,
} from '../../../src/controller/response/point-of-sale-response';
import PointOfSaleService from '../../../src/service/point-of-sale-service';
import PointOfSaleRequest from '../../../src/controller/request/point-of-sale-request';
import UpdatePointOfSaleRequest from '../../../src/controller/request/update-point-of-sale-request';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';

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
  const attributes: (keyof UpdatedPointOfSaleResponse)[] = ['name', 'startDate', 'endDate', 'useAuthentication'];
  attributes.forEach((attr) => (
    (expect(update[attr as keyof UpdatePointOfSaleRequest])
      .to.equal(response[attr as keyof UpdatedPointOfSaleResponse]))));
  // const containerResponse: number[] = response.
}

/**
 * Checks if response adheres to creation.
 */
function requestUpdatedResponseEqual(request: PointOfSaleRequest,
  response: UpdatedPointOfSaleResponse) {
  updateUpdatedResponseEqual(request.update, response);
  expect(request.ownerId).to.equal(response.owner.id);
}

describe('PointOfSaleService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    pointsOfSale: PointOfSale[],
    updatedPointsOfSale: UpdatedPointOfSale[],
    validPOSRequest: PointOfSaleRequest,
  };

  before(async function before() {
    this.timeout(5000);

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
    } = await seedAllContainers(users, productRevisions, products);
    const {
      pointsOfSale,
      updatedPointsOfSale,
    } = await seedAllPointsOfSale(users, containerRevisions, containers);

    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    const validPOSRequest: PointOfSaleRequest = {
      update: {
        containers: [containers[0].id, containers[1].id, containers[2].id],
        endDate: '2100-01-01T21:00:00.000Z',
        name: 'Valid POS',
        startDate: '2100-01-01T17:00:00.000Z',
        useAuthentication: false,
      },
      ownerId: users[0].id,
    };

    ctx = {
      connection,
      app,
      specification,
      users,
      pointsOfSale,
      updatedPointsOfSale,
      validPOSRequest,
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
    it('should return points of sale with useAuthentication specified', async () => {
      const { records } = (await PointOfSaleService.getPointsOfSale({
        useAuthentication: false,
      }) as PaginatedPointOfSaleResponse);

      expect(pointOfSaleSuperset(records, ctx.pointsOfSale)).to.be.true;
      const doNotUseAuthentication = records.every((pointOfSale) => (
        pointOfSale.useAuthentication === false));
      expect(doNotUseAuthentication).to.be.true;
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
  });
  describe('verifyPointOfSale function', () => {
    it('should return true for a valid POSRequest', async () => {
      const valid = await PointOfSaleService.verifyPointOfSale(ctx.validPOSRequest);
      expect(valid).to.be.true;
    });
    it('should return false for an invalid name', async () => {
      const invalidRequest = {
        ...ctx.validPOSRequest,
        update: { ...ctx.validPOSRequest.update, name: '' },
      };
      const valid = await PointOfSaleService.verifyPointOfSale(invalidRequest);
      expect(valid).to.be.false;
    });
    it('should return false for an invalid startDate', async () => {
      const invalidRequest = {
        ...ctx.validPOSRequest,
        update: { ...ctx.validPOSRequest.update, startDate: '' },
      };
      const valid = await PointOfSaleService.verifyPointOfSale(invalidRequest);
      expect(valid).to.be.false;
    });
    it('should return false for an invalid endDate', async () => {
      const invalidRequest = {
        ...ctx.validPOSRequest,
        update: { ...ctx.validPOSRequest.update, endDate: '' },
      };
      const valid = await PointOfSaleService.verifyPointOfSale(invalidRequest);
      expect(valid).to.be.false;
    });
    it('should return false for an invalid date', async () => {
      const invalidRequest = {
        ...ctx.validPOSRequest,
        update: { ...ctx.validPOSRequest.update, endDate: ctx.validPOSRequest.update.startDate },
      };
      const valid = await PointOfSaleService.verifyPointOfSale(invalidRequest);
      expect(valid).to.be.false;
    });
    it('should return false for an invalid Owner', async () => {
      const invalidRequest = { ...ctx.validPOSRequest, ownerId: -1 };
      const valid = await PointOfSaleService.verifyPointOfSale(invalidRequest);
      expect(valid).to.be.false;
    });
    it('should return false for invalid containers', async () => {
      const invalidRequest = {
        ...ctx.validPOSRequest,
        update: { ...ctx.validPOSRequest.update, containers: [-1, -69] },
      };
      const valid = await PointOfSaleService.verifyPointOfSale(invalidRequest);
      expect(valid).to.be.false;
    });
  });
  describe('createPointOfSale function', () => {
    it('should create a new PointOfSale', async () => {
      const count = await PointOfSale.count();
      const res: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.createPointOfSale(ctx.validPOSRequest));

      expect(await PointOfSale.count()).to.equal(count + 1);

      const updatedPointOfSale = await UpdatedPointOfSale.findOne(res.id, { relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.id);
      expect(ctx.validPOSRequest.update.containers).to.deep.equalInAnyOrder(containers);

      expect(updatedPointOfSale.name).to.equal(ctx.validPOSRequest.update.name);
      expect(updatedPointOfSale.startDate.toISOString())
        .to.equal(ctx.validPOSRequest.update.startDate);
      expect(updatedPointOfSale.endDate.toISOString())
        .to.equal(ctx.validPOSRequest.update.endDate);
      expect(updatedPointOfSale.useAuthentication)
        .to.equal(ctx.validPOSRequest.update.useAuthentication);

      requestUpdatedResponseEqual(ctx.validPOSRequest, res);
    });
  });
  describe('UpdatePointOfSale function', () => {
    it('should create a new UpdatedPointOfSale', async () => {
      const id = 1;
      // Precondition: POS has no existing update
      expect(await UpdatedPointOfSale.findOne(id)).to.be.undefined;

      const updateRequest: UpdatePointOfSaleRequest = {
        containers: [1, 2, 3],
        endDate: '2050-01-01T21:00:00.000Z',
        name: 'Updated POS',
        startDate: '2049-01-01T17:00:00.000Z',
        useAuthentication: true,
      };

      const res: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.updatePointOfSale(id, updateRequest));

      const updatedPointOfSale = await UpdatedPointOfSale.findOne(res.id, { relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.id);
      expect(ctx.validPOSRequest.update.containers).to.deep.equalInAnyOrder(containers);

      updateUpdatedResponseEqual(updateRequest, res);
    });
    it('should replace an old update', async () => {
      const id = 6;
      // Precondition: POS has existing update
      const update = await UpdatedPointOfSale.findOne(id, { relations: ['containers'] });
      expect(update).to.not.be.undefined;

      const updateRequest: UpdatePointOfSaleRequest = {
        containers: [1, 2, 3],
        endDate: '2050-01-01T21:00:00.000Z',
        name: 'Updated POS',
        startDate: '2049-01-01T17:00:00.000Z',
        useAuthentication: true,
      };

      const res: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.updatePointOfSale(id, updateRequest));

      const updatedPointOfSale = await UpdatedPointOfSale.findOne(res.id, { relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.id);
      expect(ctx.validPOSRequest.update.containers).to.deep.equalInAnyOrder(containers);

      updateUpdatedResponseEqual(updateRequest, res);
    });
  });
  describe('approvePointOfSaleUpdate function', () => {
    it('should approve a new PointOfSale update', async () => {
      const newPOS: UpdatedPointOfSaleResponse = (
        await PointOfSaleService.createPointOfSale(ctx.validPOSRequest));

      const res = ((
        (await PointOfSaleService
          .approvePointOfSaleUpdate(newPOS.id)) as any) as PointOfSaleResponse);

      const pointOfSaleRevision = await PointOfSaleRevision.findOne({ revision: res.revision, pointOfSale: { id: newPOS.id } }, { relations: ['containers'] });
      const containers = pointOfSaleRevision.containers.map((container) => container.container.id);
      expect(ctx.validPOSRequest.update.containers).to.deep.equalInAnyOrder(containers);

      expect(res.name).to.equal(pointOfSaleRevision.name);
      expect(res.revision).to.equal(pointOfSaleRevision.revision);
    });
  });
});
