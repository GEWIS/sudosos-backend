/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

import { DataSource } from 'typeorm';
import { expect } from 'chai';
import sinon from 'sinon';
import Database from '../../../../src/database/database';
import { truncateAllTables } from '../../../setup';
import { finishTestDB } from '../../../helpers/test-helpers';
import { UserSeeder, PointOfSaleSeeder } from '../../../seed';
import User, { UserType } from '../../../../src/entity/user/user';
import PointOfSale from '../../../../src/entity/point-of-sale/point-of-sale';
import JsonWebToken from '../../../../src/authentication/json-web-token';
import { getPointOfSaleRelation } from '../../../../src/service/websocket/pos-relation-helper';
import PointOfSaleService from '../../../../src/service/point-of-sale-service';

describe('POS Relation Helper', () => {
  let connection: DataSource;
  let users: User[];
  let pointsOfSale: PointOfSale[];
  let memberUser: User;
  let organUser: User;
  let posOwner: User;
  let stubs: sinon.SinonStub[] = [];

  before(async () => {
    connection = await Database.initialize();
    await truncateAllTables(connection);

    users = await new UserSeeder().seed();
    const { pointsOfSale: seededPOS } = await new PointOfSaleSeeder().seed(users);
    pointsOfSale = seededPOS.filter((p) => p.deletedAt == null);

    // Ensure we have at least one POS
    expect(pointsOfSale.length).to.be.greaterThan(0, 'Test requires at least one POS');

    // Reload POS with owner relation
    for (let i = 0; i < pointsOfSale.length; i++) {
      const loaded = await PointOfSale.findOne({
        where: { id: pointsOfSale[i].id },
        relations: ['owner', 'user'],
      });
      expect(loaded).to.not.be.null;
      if (loaded) {
        pointsOfSale[i] = loaded;
      }
    }

    // Ensure we have a member user
    memberUser = users.find((u) => u.type === UserType.MEMBER);
    expect(memberUser).to.not.be.undefined;

    // Ensure we have an organ user
    organUser = users.find((u) => u.type === UserType.ORGAN);
    expect(organUser).to.not.be.undefined;
    expect(organUser?.type).to.equal(UserType.ORGAN);

    posOwner = pointsOfSale[0].owner;
    expect(posOwner).to.not.be.undefined;

    // Ensure at least one POS has an organ user as owner for organ relation tests
    // If not, set one POS owner to organ user
    const posWithOrganOwner = pointsOfSale.find((p) => p.owner.type === UserType.ORGAN);
    if (!posWithOrganOwner && organUser) {
      const testPos = pointsOfSale[0];
      testPos.owner = organUser;
      await testPos.save();
    }
  });

  afterEach(() => {
    // Restore all stubs after each test
    stubs.forEach(stub => stub.restore());
    stubs = [];
  });

  after(async () => {
    await finishTestDB(connection);
  });

  describe('getPointOfSaleRelation', () => {
    it('should return "all" when POS does not exist', async () => {
      const token = { organs: [] } as JsonWebToken;
      const relation = await getPointOfSaleRelation(memberUser.id, token, 99999);
      expect(relation).to.equal('all');
    });

    it('should return "all" when user has no relation to POS', async () => {
      const pos = pointsOfSale[0];
      const token = { organs: [] } as JsonWebToken;
      const canViewStub = sinon.stub(PointOfSaleService, 'canViewPointOfSale').resolves(false);
      stubs.push(canViewStub);

      const relation = await getPointOfSaleRelation(memberUser.id, token, pos.id);

      expect(relation).to.equal('all');
      expect(canViewStub.called).to.be.true;
      expect(canViewStub.firstCall.args[0]).to.equal(memberUser.id);
    });

    it('should return "organ" when user is in same organ as POS owner', async () => {
      const posWithOrganOwner = pointsOfSale.find((p) => p.owner.type === UserType.ORGAN) || pointsOfSale[0];
      const organOwner = posWithOrganOwner.owner.type === UserType.ORGAN 
        ? posWithOrganOwner.owner 
        : organUser;
      
      const token = {
        organs: [{ id: organOwner.id }],
      } as JsonWebToken;

      const originalOwner = posWithOrganOwner.owner;
      posWithOrganOwner.owner = organOwner;
      await posWithOrganOwner.save();

      try {
        const relation = await getPointOfSaleRelation(memberUser.id, token, posWithOrganOwner.id);
        expect(relation).to.equal('organ');
      } finally {
        posWithOrganOwner.owner = originalOwner;
        await posWithOrganOwner.save();
      }
    });

    it('should return "own" when user can view POS directly', async () => {
      const pos = pointsOfSale[0];
      const token = { organs: [] } as JsonWebToken;
      const canViewStub = sinon.stub(PointOfSaleService, 'canViewPointOfSale').resolves(true);
      stubs.push(canViewStub);

      const relation = await getPointOfSaleRelation(memberUser.id, token, pos.id);

      expect(relation).to.equal('own');
      expect(canViewStub.called).to.be.true;
      expect(canViewStub.firstCall.args[0]).to.equal(memberUser.id);
    });

    it('should prioritize "organ" over "own" when both conditions are met', async () => {
      const posWithOrganOwner = pointsOfSale.find((p) => p.owner.type === UserType.ORGAN) || pointsOfSale[0];
      const organOwner = posWithOrganOwner.owner.type === UserType.ORGAN 
        ? posWithOrganOwner.owner 
        : organUser;
      
      const token = {
        organs: [{ id: organOwner.id }],
      } as JsonWebToken;
      const canViewStub = sinon.stub(PointOfSaleService, 'canViewPointOfSale').resolves(true);
      stubs.push(canViewStub);

      const originalOwner = posWithOrganOwner.owner;
      posWithOrganOwner.owner = organOwner;
      await posWithOrganOwner.save();

      try {
        const relation = await getPointOfSaleRelation(memberUser.id, token, posWithOrganOwner.id);
        expect(relation).to.equal('organ');
      } finally {
        posWithOrganOwner.owner = originalOwner;
        await posWithOrganOwner.save();
      }
    });

    it('should handle token with multiple organs', async () => {
      const posWithOrganOwner = pointsOfSale.find((p) => p.owner.type === UserType.ORGAN) || pointsOfSale[0];
      const organOwner = posWithOrganOwner.owner.type === UserType.ORGAN 
        ? posWithOrganOwner.owner 
        : organUser;
      
      const token = {
        organs: [
          { id: 999 },
          { id: organOwner.id },
          { id: 888 },
        ],
      } as JsonWebToken;

      const originalOwner = posWithOrganOwner.owner;
      posWithOrganOwner.owner = organOwner;
      await posWithOrganOwner.save();

      try {
        const relation = await getPointOfSaleRelation(memberUser.id, token, posWithOrganOwner.id);
        expect(relation).to.equal('organ');
      } finally {
        posWithOrganOwner.owner = originalOwner;
        await posWithOrganOwner.save();
      }
    });

    it('should handle token with no organs property', async () => {
      const pos = pointsOfSale[0];
      const token = {} as JsonWebToken;
      const canViewStub = sinon.stub(PointOfSaleService, 'canViewPointOfSale').resolves(false);
      stubs.push(canViewStub);

      const relation = await getPointOfSaleRelation(memberUser.id, token, pos.id);

      expect(relation).to.equal('all');
    });

    it('should return "all" when POS does not exist in database', async () => {
      const token = { organs: [] } as JsonWebToken;
      const canViewStub = sinon.stub(PointOfSaleService, 'canViewPointOfSale').resolves(false);
      stubs.push(canViewStub);

      const findOneStub = sinon.stub(PointOfSale, 'findOne').resolves(null);
      stubs.push(findOneStub);

      const relation = await getPointOfSaleRelation(memberUser.id, token, 99999);

      expect(relation).to.equal('all');
    });
  });
});
