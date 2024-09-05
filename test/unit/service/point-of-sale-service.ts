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

import { Connection, getManager, IsNull, Not } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User, { UserType } from '../../../src/entity/user/user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import {
  PaginatedPointOfSaleResponse,
  PointOfSaleResponse,
  PointOfSaleWithContainersResponse,
} from '../../../src/controller/response/point-of-sale-response';
import PointOfSaleService from '../../../src/service/point-of-sale-service';
import { CreatePointOfSaleParams, UpdatePointOfSaleParams } from '../../../src/controller/request/point-of-sale-request';
import AuthenticationService from '../../../src/service/authentication-service';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import RbacSeeder, { SeededRole } from '../../seed/rbac-seeder';
import { ContainerSeeder, PointOfSaleSeeder, ProductSeeder, UserSeeder } from '../../seed';

chai.use(deepEqualInAnyOrder);

/**
 * Test if all the point of sale responses are part of the point of sale set array.
 * @param response
 * @param superset
 */
function pointOfSaleSuperset(response: PointOfSaleResponse[], superset: PointOfSale[]): Boolean {
  return response.every((searchPOS: PointOfSaleResponse) => (
    superset.find((supersetPOS: PointOfSale) => (
      supersetPOS.id === searchPOS.id
          && supersetPOS.owner.id === searchPOS.owner.id
    )) !== undefined
  ));
}

/**
 * Checks if response adheres to creation.
 */
function requestUpdatedResponseEqual(request: CreatePointOfSaleParams,
  response: PointOfSaleWithContainersResponse) {
  expect(request.name).to.equal(response.name);
  if (response.containers) expect(request.containers).to.deep.equalInAnyOrder(response.containers.map((c) => c.id));
  expect(request.ownerId).to.equal(response.owner.id);
  expect(request.cashierRoleIds).to.deep.equalInAnyOrder(response.cashierRoles.map((r) => r.id));
}

function updateResponseEqual(update: UpdatePointOfSaleParams,
  response: PointOfSaleWithContainersResponse) {
  expect(update.id).to.equal(response.id);
  expect(update.name).to.equal(response.name);
  expect(update.containers).to.deep.equalInAnyOrder(response.containers.map((c) => c.id));
  expect(update.cashierRoleIds).to.deep.equalInAnyOrder(response.cashierRoles.map((r) => r.id));
}

describe('PointOfSaleService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    pointsOfSale: PointOfSale[],
    deletedPointsOfSale: PointOfSale[],
    validPOSParams: CreatePointOfSaleParams,
    roles: SeededRole[],
    feut1: User,
    feut2: User,
    bestuur1: User,
  };

  before(async function before() {
    this.timeout(5000);

    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const {
      productRevisions,
    } = await new ProductSeeder().seed(users);
    const {
      containers,
      containerRevisions,
    } = await new ContainerSeeder().seed(users, productRevisions);
    const {
      pointsOfSale,
    } = await new PointOfSaleSeeder().seed(users, containerRevisions);

    const feut1 = users.filter((u) => u.type === UserType.MEMBER)[0];
    const feut2 = users.filter((u) => u.type === UserType.MEMBER)[1];
    const bestuur1 = users.filter((u) => u.type === UserType.MEMBER)[2];
    const roles = await new RbacSeeder().seed([{
      name: 'BAC Feuten',
      permissions: {},
      assignmentCheck: async (user) => user.id === feut1.id || user.id === feut2.id,
    }, {
      name: 'Bestuur',
      permissions: {},
      assignmentCheck: async (user) => user.id === bestuur1.id,
    }]);

    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    const validPOSParams: CreatePointOfSaleParams = {
      containers: containers.filter((c) => c.deletedAt == null).map((c) => c.id),
      name: 'Valid POS',
      useAuthentication: true,
      ownerId: 1,
      cashierRoleIds: [roles[0].role.id],
    };

    ctx = {
      connection,
      app,
      specification,
      users,
      pointsOfSale: pointsOfSale.filter((p) => p.deletedAt == null),
      deletedPointsOfSale: pointsOfSale.filter((p) => p.deletedAt != null),
      validPOSParams,
      roles,
      feut1,
      feut2,
      bestuur1,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
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
      const memberAuthenticators = await MemberAuthenticator.find({
        where: { user: { id: owner.id } },
      });
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
      await MemberAuthenticator.delete({ user: { id: owner.id } });
    });
  });
  describe('createPointOfSale function', () => {
    it('should create a new PointOfSale', async () => {
      const count = await PointOfSale.count();
      const res = (
        await PointOfSaleService.createPointOfSale(ctx.validPOSParams));

      expect(await PointOfSale.count()).to.equal(count + 1);

      const updatedPointOfSale = await PointOfSaleRevision.findOne({ where: { pointOfSale: { id: res.id }, revision: res.revision }, relations: ['containers'] });
      const containers = updatedPointOfSale.containers.map((container) => container.container.id);
      expect(ctx.validPOSParams.containers).to.deep.equalInAnyOrder(containers);

      expect(updatedPointOfSale.name).to.equal(ctx.validPOSParams.name);

      requestUpdatedResponseEqual(ctx.validPOSParams, res as PointOfSaleWithContainersResponse);
    });
  });
  describe('directPointOfSaleUpdate function', () => {
    it('should revise the point of sale without creating a UpdatedPointOfSale', async () => {
      const pointOfSale = await PointOfSale.findOne({ where: {} });
      const update: UpdatePointOfSaleParams = {
        containers: [3],
        id: pointOfSale.id,
        name: 'Pos Updated Name',
        useAuthentication: true,
        cashierRoleIds: [ctx.roles[1].role.id],
      };

      const response = (await PointOfSaleService.updatePointOfSale(update)) as PointOfSaleWithContainersResponse;
      updateResponseEqual(update, response);
    });
  });
  describe('deletePointOfSale function', () => {
    it('should soft delete pointOfSale', async () => {
      const start = Math.floor(new Date().getTime() / 1000) * 1000;
      const pointOfSale = ctx.pointsOfSale[0];
      let dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSale.id }, withDeleted: true });
      // Sanity check
      expect(dbPointOfSale).to.not.be.null;
      expect(dbPointOfSale.deletedAt).to.be.null;

      await PointOfSaleService.deletePointOfSale(pointOfSale.id);

      dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSale.id }, withDeleted: true });
      expect(dbPointOfSale).to.not.be.null;
      expect(dbPointOfSale.deletedAt).to.not.be.null;
      expect(dbPointOfSale.deletedAt.getTime()).to.be.greaterThanOrEqual(start);

      const deletedPointsOfSale = await PointOfSale.find({ where: { deletedAt: Not(IsNull()) }, withDeleted: true });
      expect(deletedPointsOfSale.length).to.equal(ctx.deletedPointsOfSale.length + 1);

      // Revert state
      await dbPointOfSale.recover();
    });
    it('should throw error for non existent pointOfSale', async () => {
      const pointOfSaleId = ctx.pointsOfSale.length + ctx.deletedPointsOfSale.length + 2;
      let dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSaleId }, withDeleted: true });
      // Sanity check
      expect(dbPointOfSale).to.be.null;

      await expect(PointOfSaleService.deletePointOfSale(pointOfSaleId)).to.eventually.be.rejectedWith('Point of sale not found');

      const deletedPointsOfSale = await PointOfSale.find({ where: { deletedAt: Not(IsNull()) }, withDeleted: true });
      expect(deletedPointsOfSale.length).to.equal(ctx.deletedPointsOfSale.length);
    });
    it('should throw error when soft deleting pointOfSale twice', async () => {
      const pointOfSale = ctx.pointsOfSale[0];
      let dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSale.id }, withDeleted: true });
      // Sanity check
      expect(dbPointOfSale).to.not.be.null;
      expect(dbPointOfSale.deletedAt).to.be.null;

      await PointOfSaleService.deletePointOfSale(pointOfSale.id);

      dbPointOfSale = await PointOfSale.findOne({ where: { id: pointOfSale.id }, withDeleted: true });
      expect(dbPointOfSale).to.not.be.null;
      expect(dbPointOfSale.deletedAt).to.not.be.null;

      await expect(PointOfSaleService.deletePointOfSale(pointOfSale.id)).to.eventually.be.rejectedWith('Point of sale not found');

      // Revert state
      await dbPointOfSale.recover();
    });
  });
});
