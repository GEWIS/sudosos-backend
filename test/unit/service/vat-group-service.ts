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
import { expect } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import VatGroup from '../../../src/entity/vat-group';
import User from '../../../src/entity/user/user';
import { VatGroupRequest } from '../../../src/controller/request/vat-group-request';
import Database from '../../../src/database/database';
import { seedUsers, seedVatGroups } from '../../seed';
import VatGroupService from '../../../src/service/vat-group-service';
import Swagger from '../../../src/start/swagger';

describe('VatGroupService', () => {
  let ctx: {
    connection: Connection,
    users: User[],
    vatGroups: VatGroup[],
    validVatCreateReq: VatGroupRequest,
    spec: SwaggerSpecification,
  };

  before(async () => {
    const connection = await Database.initialize();
    const users = await seedUsers();
    const vatGroups = await seedVatGroups();

    const validVatCreateReq: VatGroupRequest = {
      name: 'Extreem hoog tarief',
      percentage: 39,
      hideIfZero: false,
    };

    ctx = {
      connection,
      users,
      vatGroups,
      validVatCreateReq,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('Get VAT groups', () => {
    it('should return all VAT groups', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await VatGroupService.getVatGroups({});

      expect(records.length).to.equal(ctx.vatGroups.length);
      records.forEach((v) => {
        const validation = ctx.spec.validateModel('VatGroup', v, false, true);
        expect(validation.valid).to.be.true;
      });

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(ctx.vatGroups.length);
    });
    it('should adhere to pagination', async () => {
      const take = 3;
      const skip = 2;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await VatGroupService.getVatGroups({}, {
        take: 3,
        skip: 2,
      });

      expect(records.length).to.equal(Math.min(ctx.vatGroups.length - skip, take));
      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(ctx.vatGroups.length);
    });
    it('should filter on id', async () => {
      const vatGroupId = ctx.vatGroups[0].id;
      const { records } = await VatGroupService.getVatGroups({ vatGroupId });

      expect(records.length).to.equal(1);
      expect(records[0].id).to.equal(vatGroupId);
    });
    it('should filter on name', async () => {
      const { name } = ctx.vatGroups[0];
      const { records } = await VatGroupService.getVatGroups({ name });
      records.map((r) => expect(r.name).to.equal(name));
    });
    it('should filter on percentage', async () => {
      const { percentage } = ctx.vatGroups[1];
      const { records } = await VatGroupService.getVatGroups({ percentage });
      records.map((r) => expect(r.percentage).to.equal(percentage));
    });
    it('should filter on hideIfZero', async () => {
      const hideIfZero = false;
      const { records } = await VatGroupService.getVatGroups({ hideIfZero });
      records.map((r) => expect(r.hideIfZero).to.equal(hideIfZero));
    });
  });

  describe('create VAT groups', () => {
    it('should correctly create a VAT group', async () => {
      const lengthBefore = await VatGroup.count();

      const vatGroup = await VatGroupService.createVatGroup(ctx.validVatCreateReq);

      const validation = ctx.spec.validateModel('VatGroup', vatGroup, false, true);
      expect(validation.valid).to.be.true;
      expect(await VatGroup.count()).to.equal(lengthBefore + 1);
    });
  });

  describe('update VAT groups', () => {
    it('should correctly update VAT group', async () => {
      const name = 'NewName';

      const vatGroupOld = ctx.vatGroups[0];
      const vatGroupNew = await VatGroupService.updateVatGroup(vatGroupOld.id, {
        name,
        hideIfZero: !vatGroupOld.hideIfZero,
      });
      const vatGroup = await VatGroup.findOne({ where: { id: vatGroupOld.id } });

      expect(vatGroup.name).to.equal(name);
      expect(vatGroupNew.name).to.equal(name);
      expect(vatGroup.hideIfZero).to.equal(!vatGroupOld.hideIfZero);
      expect(vatGroupNew.hideIfZero).to.equal(!vatGroupOld.hideIfZero);
    });

    it('should return undefined if VAT group does not exist', async () => {
      const id = ctx.vatGroups[ctx.vatGroups.length - 1].id + 1000;

      const vatGroupNew = await VatGroupService.updateVatGroup(id, {
        name: 'yeee',
        hideIfZero: false,
      });

      expect(vatGroupNew).to.be.undefined;
    });
  });
});
