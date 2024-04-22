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
import VatGroup, { VatDeclarationPeriod } from '../../../src/entity/vat-group';
import User from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import { VatGroupRequest } from '../../../src/controller/request/vat-group-request';
import Database from '../../../src/database/database';
import {
  seedContainers,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import VatGroupService from '../../../src/service/vat-group-service';
import { VatDeclarationResponse } from '../../../src/controller/response/vat-group-response';
import { truncateAllTables } from '../../setup';

describe('VatGroupService', () => {
  let ctx: {
    connection: Connection,
    users: User[],
    vatGroups: VatGroup[],
    transactions: Transaction[],
    validVatCreateReq: VatGroupRequest,
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const users = await seedUsers();
    const vatGroups = await seedVatGroups();
    const categories = await seedProductCategories();
    const { productRevisions } = await seedProducts(users, categories, vatGroups, 100);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2022-11-30'), 3);

    const validVatCreateReq: VatGroupRequest = {
      name: 'Extreem hoog tarief',
      percentage: 39,
      deleted: false,
      hidden: false,
    };

    ctx = {
      connection,
      users,
      vatGroups,
      transactions,
      validVatCreateReq,
    };
  });

  after(async () => {
    await Database.finish(ctx.connection);
  });

  describe('Get VAT groups', () => {
    it('should return all VAT groups', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await VatGroupService.getVatGroups({});

      expect(records.length).to.equal(ctx.vatGroups.length);

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
    it('should filter on deleted', async () => {
      const deleted = false;
      const { records } = await VatGroupService.getVatGroups({ deleted });
      records.map((r) => expect(r.deleted).to.equal(deleted));
    });
  });

  describe('calculateVatDeclaration', async () => {
    const calculateVatValues = (year: number, period: number): any => {
      const actualValues: any = {};
      ctx.vatGroups.forEach((g) => {
        actualValues[g.id] = new Array(Math.ceil(12 / period)).fill(0);
      });
      ctx.transactions.forEach((g) => g.subTransactions
        .forEach((s) => s.subTransactionRows
          .forEach((r) => {
            const { vat } = r.product;
            const y = g.createdAt.getFullYear();
            const m = Math.floor(g.createdAt.getMonth() / period);
            if (y === year) {
              actualValues[vat.id][m] += Math.round(
                (r.amount * r.product.priceInclVat.getAmount() * vat.percentage)
                / (100 + vat.percentage),
              );
            }
          })));

      ctx.vatGroups.forEach((g) => {
        if (g.deleted && actualValues[g.id].reduce(
          (prev: number, curr: number) => Math.max(prev, curr), 0,
        ) === 0) {
          delete actualValues[g.id];
        }
      });

      return actualValues;
    };

    const testVatCalculations = async (
      year: number, period: VatDeclarationPeriod,
    ): Promise<VatDeclarationResponse> => {
      let p: number;
      switch (period) {
        case VatDeclarationPeriod.MONTHLY: p = 1; break;
        case VatDeclarationPeriod.QUARTERLY: p = 3; break;
        case VatDeclarationPeriod.ANNUALLY: p = 12; break;
        default: throw new Error();
      }
      const actualValues = calculateVatValues(year, p);

      const result = await VatGroupService.calculateVatDeclaration({
        year,
        period,
      });

      const actualIds = Object.keys(actualValues);
      expect(result.rows.length).to.equal(actualIds.length);
      expect(result.calendarYear).to.equal(year);
      expect(result.period).to.equal(period);
      result.rows.forEach((r) => {
        const amounts = r.values.map((d) => d.amount);
        expect(amounts.length).to.equal(12 / p);
        expect(JSON.stringify(amounts)).to.equal(JSON.stringify(actualValues[r.id]));
      });

      return result;
    };

    const testPeriodConsistency = async (
      response: VatDeclarationResponse, newPeriod: VatDeclarationPeriod,
    ): Promise<void> => {
      let p1: number;
      switch (response.period) {
        case VatDeclarationPeriod.MONTHLY: p1 = 12; break;
        case VatDeclarationPeriod.QUARTERLY: p1 = 4; break;
        case VatDeclarationPeriod.ANNUALLY: p1 = 1; break;
        default: throw new Error();
      }
      let p2: number;
      switch (newPeriod) {
        case VatDeclarationPeriod.MONTHLY: p2 = 12; break;
        case VatDeclarationPeriod.QUARTERLY: p2 = 4; break;
        case VatDeclarationPeriod.ANNUALLY: p2 = 1; break;
        default: throw new Error();
      }

      const newResponse = await VatGroupService.calculateVatDeclaration({
        year: response.calendarYear,
        period: newPeriod,
      });

      expect(response.rows.length).to.equal(newResponse.rows.length);
      let subsetSize = p1 / p2;
      let inverted = false;
      if (subsetSize < 1) {
        subsetSize = 1 / subsetSize;
        inverted = true;
      }
      subsetSize = Math.round(subsetSize);

      for (let i = 0; i < response.rows.length; i += 1) {
        const row1 = response.rows[i];
        const row2 = newResponse.rows[i];
        let result1: number[] = [];
        let result2: number[] = [];
        if (!inverted) {
          for (let j = 0; j < p2; j += 1) {
            result1.push(row1.values
              .slice(subsetSize * j, subsetSize * (j + 1))
              .reduce((a, b) => a + b.amount, 0));
          }
          result2 = row2.values.map((v) => v.amount);
        } else {
          result1 = row1.values.map((v) => v.amount);
          for (let j = 0; j < p1; j += 1) {
            result2.push(row2.values
              .slice(subsetSize * j, subsetSize * (j + 1))
              .reduce((a, b) => a + b.amount, 0));
          }
        }

        expect(JSON.stringify(result1)).to.equal(JSON.stringify(result2));
      }
    };

    before(() => async () => {
      let extraVatGroup = Object.assign(new VatGroup(), {
        name: 'ExtraEmptyVatGroup',
        percentage: 10,
        deleted: true,
      });

      extraVatGroup = await extraVatGroup.save();
      ctx.vatGroups.push(extraVatGroup);
    });

    it('should correctly calculate monthly VAT declaration 2021', async () => {
      await testVatCalculations(2021, VatDeclarationPeriod.MONTHLY);
    });

    it('should correctly calculate monthly VAT declaration 2022', async () => {
      await testVatCalculations(2022, VatDeclarationPeriod.MONTHLY);
    });

    it('should correctly calculate quarterly VAT declaration 2021', async () => {
      const response = await testVatCalculations(2021, VatDeclarationPeriod.QUARTERLY);
      await testPeriodConsistency(response, VatDeclarationPeriod.MONTHLY);
    });

    it('should correctly calculate quarterly VAT declaration 2022', async () => {
      const response = await testVatCalculations(2022, VatDeclarationPeriod.QUARTERLY);
      await testPeriodConsistency(response, VatDeclarationPeriod.MONTHLY);
    });

    it('should correctly calculate annual VAT declaration 2021', async () => {
      const response = await testVatCalculations(2021, VatDeclarationPeriod.ANNUALLY);
      await testPeriodConsistency(response, VatDeclarationPeriod.QUARTERLY);
    });

    it('should correctly calculate annual VAT declaration 2022', async () => {
      const response = await testVatCalculations(2022, VatDeclarationPeriod.ANNUALLY);
      await testPeriodConsistency(response, VatDeclarationPeriod.QUARTERLY);
    });
  });

  describe('create VAT groups', () => {
    it('should correctly create a VAT group', async () => {
      const lengthBefore = await VatGroup.count();

      const vatGroup = await VatGroupService.createVatGroup(ctx.validVatCreateReq);

      expect(vatGroup.name).to.equal(ctx.validVatCreateReq.name);
      expect(vatGroup.deleted).to.equal(ctx.validVatCreateReq.deleted);
      expect(vatGroup.hidden).to.equal(ctx.validVatCreateReq.hidden);
      expect(vatGroup.percentage).to.equal(ctx.validVatCreateReq.percentage);

      expect(await VatGroup.count()).to.equal(lengthBefore + 1);
    });
  });

  describe('update VAT groups', () => {
    it('should correctly update VAT group', async () => {
      const name = 'NewName';

      const vatGroupOld = ctx.vatGroups[0];
      const vatGroupNew = await VatGroupService.updateVatGroup(vatGroupOld.id, {
        name,
        deleted: !vatGroupOld.deleted,
        hidden: !vatGroupOld.hidden,
      });
      const vatGroup = await VatGroup.findOne({ where: { id: vatGroupOld.id } });

      expect(vatGroup.name).to.equal(name);
      expect(vatGroupNew.name).to.equal(name);
      expect(vatGroup.deleted).to.equal(!vatGroupOld.deleted);
      expect(vatGroupNew.deleted).to.equal(!vatGroupOld.deleted);
      expect(vatGroup.hidden).to.equal(!vatGroupOld.hidden);
      expect(vatGroupNew.hidden).to.equal(!vatGroupOld.hidden);
    });

    it('should return undefined if VAT group does not exist', async () => {
      const id = ctx.vatGroups[ctx.vatGroups.length - 1].id + 1000;

      const vatGroupNew = await VatGroupService.updateVatGroup(id, {
        name: 'yeee',
        deleted: false,
        hidden: true,
      });

      expect(vatGroupNew).to.be.undefined;
    });
  });
});
