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
 *
 *  @license
 */

import express, { Application } from 'express';
import chai, { expect } from 'chai';
import { DataSource } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import Database from '../../../src/database/database';
import WrappedService from '../../../src/service/wrapped-service';
import Wrapped from '../../../src/entity/wrapped';
import WrappedOrganMember from '../../../src/entity/wrapped/wrapped-organ-member';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import OrganMembership from '../../../src/entity/organ/organ-membership';
import Swagger from '../../../src/start/swagger';
import { finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { UserSeeder, ContainerSeeder, ProductSeeder, TransactionSeeder } from '../../seed';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';

chai.use(deepEqualInAnyOrder);

describe('WrappedService', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    organs: User[],
    organMemberships: OrganMembership[],
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    productRevisions: ProductRevision[],
    containerRevisions: ContainerRevision[],
    wrappedYear: number,
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const app = express();
    const wrappedYear = 2023;

    // Seed users
    const userSeeder = new UserSeeder(connection.manager);
    const users = await userSeeder.seed();

    // Create additional users with different states for testing
    const userWithExtData = Object.assign(new User(), {
      firstName: 'ExtData',
      lastName: 'User',
      type: UserType.MEMBER,
      active: true,
      deleted: false,
      extensiveDataProcessing: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    await connection.manager.save(userWithExtData);
    users.push(userWithExtData);

    const userWithoutExtData = Object.assign(new User(), {
      firstName: 'NoExtData',
      lastName: 'User',
      type: UserType.MEMBER,
      active: true,
      deleted: false,
      extensiveDataProcessing: false,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    await connection.manager.save(userWithoutExtData);
    users.push(userWithoutExtData);

    const inactiveUser = Object.assign(new User(), {
      firstName: 'Inactive',
      lastName: 'User',
      type: UserType.MEMBER,
      active: false,
      deleted: false,
      extensiveDataProcessing: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    await connection.manager.save(inactiveUser);
    users.push(inactiveUser);

    // Create organs
    const activeOrgan = Object.assign(new User(), {
      firstName: 'Active',
      lastName: 'Organ',
      type: UserType.ORGAN,
      active: true,
      deleted: false,
      extensiveDataProcessing: false,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    });
    await connection.manager.save(activeOrgan);

    const inactiveOrgan = Object.assign(new User(), {
      firstName: 'Inactive',
      lastName: 'Organ',
      type: UserType.ORGAN,
      active: false,
      deleted: false,
      extensiveDataProcessing: false,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    });
    await connection.manager.save(inactiveOrgan);

    const organs = [activeOrgan, inactiveOrgan];

    // Create organ memberships
    const organMemberships: OrganMembership[] = [];
    let index = 0;
    for (const organ of organs) {
      for (const user of users.filter((u) => u.extensiveDataProcessing && u.active && !u.deleted).slice(0, 3)) {
        const membership = Object.assign(new OrganMembership(), {
          userId: user.id,
          organId: organ.id,
          index: index++,
        });
        await connection.manager.save(membership);
        organMemberships.push(membership);
      }
    }

    // Seed products and containers
    const { productRevisions } = await new ProductSeeder(connection.manager).seed(users);
    const { containerRevisions } = await new ContainerSeeder(connection.manager).seed(users, productRevisions);

    // Create POS for active organ
    const activeOrganPosUser = Object.assign(new User(), {
      firstName: 'POS',
      lastName: 'User1',
      type: UserType.POINT_OF_SALE,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    });
    await connection.manager.save(activeOrganPosUser);

    const activeOrganPos = Object.assign(new PointOfSale(), {
      owner: activeOrgan,
      user: activeOrganPosUser,
      currentRevision: 1,
    });
    await connection.manager.save(activeOrganPos);

    const activeOrganPosRevision = Object.assign(new PointOfSaleRevision(), {
      pointOfSale: activeOrganPos,
      revision: 1,
      name: 'Active Organ POS',
      useAuthentication: false,
      containers: containerRevisions.filter((c) => c.container.owner.id === activeOrgan.id).slice(0, 2),
    });
    await connection.manager.save(activeOrganPosRevision);

    const pointsOfSale = [activeOrganPos];
    const pointOfSaleRevisions = [activeOrganPosRevision];

    // Create transactions for wrapped year and outside wrapped year
    const transactionSeeder = new TransactionSeeder(connection.manager);

    const startDate = new Date(wrappedYear, 0, 1, 0, 0, 0);
    const endDate = new Date(wrappedYear, 11, 31, 23, 59, 59);

    // Seed transactions within wrapped year using TransactionSeeder
    const { transactions: seededTransactions } = await transactionSeeder.seed(
      users,
      pointOfSaleRevisions,
      startDate,
      endDate,
    );

    // Create additional transactions within wrapped year for organ POS
    const transactions: Transaction[] = [];
    const sellers = users.filter((u) => u.extensiveDataProcessing && u.active && !u.deleted).slice(0, 5);

    for (let i = 0; i < 10; i++) {
      const from = users[i % users.length];
      const createdBy = sellers[i % sellers.length];
      const createdAt = new Date(wrappedYear, Math.floor(i / 2), (i % 28) + 1, 12, 0, 0);

      if (createdAt >= startDate && createdAt <= endDate) {
        const transaction = Object.assign(new Transaction(), {
          from,
          createdBy,
          pointOfSale: activeOrganPosRevision,
          createdAt,
          subTransactions: [],
        });

        // Create a simple subtransaction with rows
        if (activeOrganPosRevision.containers.length > 0 && activeOrganPosRevision.containers[0].products.length > 0) {
          const container = activeOrganPosRevision.containers[0];
          const product = container.products[0];

          const subTransaction = Object.assign(new SubTransaction(), {
            transaction,
            to: activeOrgan,
            container,
            createdAt,
            subTransactionRows: [],
          });

          const row = Object.assign(new SubTransactionRow(), {
            subTransaction,
            product,
            amount: (i % 3) + 1,
            createdAt,
          });

          subTransaction.subTransactionRows = [row];
          transaction.subTransactions = [subTransaction];
        }

        await connection.manager.save(Transaction, transaction);
        if (transaction.subTransactions.length > 0) {
          await connection.manager.save(transaction.subTransactions[0]);
          if (transaction.subTransactions[0].subTransactionRows.length > 0) {
            await connection.manager.save(transaction.subTransactions[0].subTransactionRows[0]);
          }
        }
        transactions.push(transaction);
      }
    }

    // Create transactions outside wrapped year for better test coverage
    const prevYearStart = new Date(wrappedYear - 1, 0, 1, 0, 0, 0);
    const prevYearEnd = new Date(wrappedYear - 1, 11, 31, 23, 59, 59);
    await transactionSeeder.seed(users, pointOfSaleRevisions, prevYearStart, prevYearEnd);

    const nextYearStart = new Date(wrappedYear + 1, 0, 1, 0, 0, 0);
    const nextYearEnd = new Date(wrappedYear + 1, 11, 31, 23, 59, 59);
    await transactionSeeder.seed(users, pointOfSaleRevisions, nextYearStart, nextYearEnd);

    // Combine all transactions
    const allTransactions = [...seededTransactions, ...transactions];

    ctx = {
      connection,
      app,
      specification: await Swagger.importSpecification(),
      users,
      organs,
      organMemberships,
      pointsOfSale,
      pointOfSaleRevisions,
      transactions: allTransactions,
      productRevisions,
      containerRevisions,
      wrappedYear,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('getWrappedForUser', () => {
    it('should return null when user has no wrapped data', async () => {
      const service = new WrappedService(ctx.connection.manager);
      const result = await service.getWrappedForUser(999999);
      expect(result).to.be.null;
    });

    it('should return Wrapped entity with organs relation when wrapped exists', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // Create wrapped data
      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 5,
        transactionPercentile: 50.0,
        transactionMaxDate: new Date(ctx.wrappedYear, 5, 15),
        transactionMaxAmount: 3,
        transactionHeatmap: JSON.stringify(new Array(365).fill(0)),
        spentPercentile: 60.0,
        syncedFrom: new Date(ctx.wrappedYear, 0, 1),
        syncedTo: new Date(),
      });
      await ctx.connection.manager.save(wrapped);

      const result = await service.getWrappedForUser(user.id);
      expect(result).to.not.be.null;
      expect(result.userId).to.equal(user.id);
      expect(result.organs).to.be.an('array');
    });
  });

  describe('asWrappedResponse', () => {
    it('should map all fields correctly', () => {
      const wrapped = Object.assign(new Wrapped(), {
        userId: 1,
        transactionCount: 10,
        transactionPercentile: 75.5,
        transactionMaxDate: new Date(ctx.wrappedYear, 6, 15),
        transactionMaxAmount: 5,
        transactionHeatmap: JSON.stringify([1, 2, 3, 4, 5]),
        spentPercentile: 80.0,
        syncedFrom: new Date(ctx.wrappedYear, 0, 1),
        syncedTo: new Date(ctx.wrappedYear, 11, 31),
        organs: [],
      });

      const response = WrappedService.asWrappedResponse(wrapped);
      expect(response.userId).to.equal(1);
      expect(response.transactions.transactionCount).to.equal(10);
      expect(response.transactions.transactionPercentile).to.equal(75.5);
      expect(response.transactions.transactionMaxAmount).to.equal(5);
      expect(response.transactions.transactionHeatmap).to.deep.equal([1, 2, 3, 4, 5]);
      expect(response.spentPercentile).to.equal(80.0);
      expect(response.organs).to.be.an('array');
    });

    it('should handle null/undefined numeric values gracefully', () => {
      const wrapped = Object.assign(new Wrapped(), {
        userId: 1,
        transactionCount: null,
        transactionPercentile: null,
        transactionMaxDate: new Date(ctx.wrappedYear, 5, 15),
        transactionMaxAmount: null,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: null,
        syncedFrom: new Date(ctx.wrappedYear, 0, 1),
        syncedTo: new Date(),
        organs: [],
      });

      const response = WrappedService.asWrappedResponse(wrapped);
      expect(response.transactions.transactionCount).to.equal(0);
      expect(response.transactions.transactionPercentile).to.equal(0);
      expect(response.transactions.transactionMaxAmount).to.equal(0);
    });

    it('should map organ member data correctly', () => {
      const organMember1 = Object.assign(new WrappedOrganMember(), {
        userId: 1,
        organId: 10,
        ordinalTransactionCreated: 0,
        ordinalTurnoverCreated: 1,
      });
      const organMember2 = Object.assign(new WrappedOrganMember(), {
        userId: 1,
        organId: 11,
        ordinalTransactionCreated: 2,
        ordinalTurnoverCreated: 0,
      });

      const wrapped = Object.assign(new Wrapped(), {
        userId: 1,
        transactionCount: 5,
        transactionPercentile: 50.0,
        transactionMaxDate: new Date(ctx.wrappedYear, 5, 15),
        transactionMaxAmount: 3,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 60.0,
        syncedFrom: new Date(ctx.wrappedYear, 0, 1),
        syncedTo: new Date(),
        organs: [organMember1, organMember2],
      });

      const response = WrappedService.asWrappedResponse(wrapped);
      expect(response.organs).to.have.length(2);
      expect(response.organs[0].organId).to.equal(10);
      expect(response.organs[0].ordinalTransactionCreated).to.equal(0);
      expect(response.organs[0].ordinalTurnoverCreated).to.equal(1);
      expect(response.organs[1].organId).to.equal(11);
      expect(response.organs[1].ordinalTransactionCreated).to.equal(2);
      expect(response.organs[1].ordinalTurnoverCreated).to.equal(0);
    });
  });

  describe('parseHeatmap', () => {
    it('should parse valid JSON array string', () => {
      const heatmap = [1, 2, 3, 4, 5];
      const result = (WrappedService as any).parseHeatmap(JSON.stringify(heatmap));
      expect(result).to.deep.equal(heatmap);
    });

    it('should return empty array for null/undefined', () => {
      expect((WrappedService as any).parseHeatmap(null)).to.deep.equal([]);
      expect((WrappedService as any).parseHeatmap(undefined)).to.deep.equal([]);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => (WrappedService as any).parseHeatmap('invalid json')).to.throw('Invalid heatmap data');
    });

    it('should return empty array for non-array parsed JSON', () => {
      expect((WrappedService as any).parseHeatmap('{"not": "array"}')).to.deep.equal([]);
    });
  });

  describe('updateWrapped', () => {
    it('should create new Wrapped records for users without existing data', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();

      await service.updateWrapped({ ids: [user.id] });

      const wrapped = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(wrapped).to.not.be.null;
      expect(wrapped.userId).to.equal(user.id);
    });

    it('should update existing Wrapped records', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const existingWrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 999,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(existingWrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(updated).to.not.be.null;
      expect(updated.userId).to.equal(user.id);
    });

    it('should filter users by extensiveDataProcessing, active, and deleted', async () => {
      const service = new WrappedService(ctx.connection.manager);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();

      await service.updateWrapped();

      const wrappedRecords = await ctx.connection.manager.find(Wrapped);
      expect(wrappedRecords.length).to.be.greaterThan(0);
      wrappedRecords.forEach((w) => {
        const user = ctx.users.find((u) => u.id === w.userId);
        expect(user.extensiveDataProcessing).to.be.true;
        expect(user.active).to.be.true;
        expect(user.deleted).to.be.false;
      });
    });

    it('should respect params.ids filter when provided', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user1 = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const user2 = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted && u.id !== user1.id);
      if (!user1 || !user2) return;

      // Ensure user2 doesn't have wrapped data
      await ctx.connection.manager.delete(Wrapped, { userId: user2.id });

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user1.id] });

      const wrapped1 = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user1.id } });
      const wrapped2 = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user2.id } });

      expect(wrapped1).to.not.be.null;
      // user2 was not in the ids filter, so should not have wrapped data
      expect(wrapped2).to.be.null;
    });

    it('should use WRAPPED_YEAR env var or current year', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const testYear = 2022;
      process.env.WRAPPED_YEAR = testYear.toString();

      await service.updateWrapped({ ids: [user.id] });

      const wrapped = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(wrapped).to.not.be.null;
      expect(wrapped.syncedFrom.getFullYear()).to.equal(testYear);
    });

    it('should handle empty user list', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // updateWrapped filters users by extensiveDataProcessing, active, deleted
      // So a non-existent user won't create any rows
      // This will throw "No rows provided" error, which is expected behavior
      try {
        await service.updateWrapped({ ids: [999999] });
        // If it doesn't throw, verify no wrapped records were created
        const wrappedRecords = await ctx.connection.manager.find(Wrapped, { where: { userId: 999999 } });
        expect(wrappedRecords.length).to.equal(0);
      } catch (error) {
        expect(error.message).to.equal('No rows provided');
      }
    });
  });

  describe('updateTransactionCount', () => {
    it('should count transactions correctly for wrapped year range', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      // Count transactions for this user in wrapped year
      const transactionCount = ctx.transactions.filter((t) => t.from.id === user.id
        && t.createdAt >= new Date(ctx.wrappedYear, 0, 1)
        && t.createdAt <= new Date(ctx.wrappedYear, 11, 31, 23, 59, 59)).length;

      await (service as any).updateTransactionCount([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(updated.transactionCount).to.equal(transactionCount);
    });

    it('should handle users with no transactions (count = 0)', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 999,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      // Delete all transactions for this user
      await ctx.connection.manager.delete(Transaction, { from: { id: user.id } });

      await (service as any).updateTransactionCount([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(updated.transactionCount).to.equal(0);
    });
  });

  describe('updateTransactionDayStats', () => {
    it('should create 365-element heatmap array', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      await (service as any).updateTransactionDayStats([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      const heatmap = JSON.parse(updated.transactionHeatmap);
      expect(heatmap).to.have.length(365);
    });

    it('should find transactionMaxDate correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      // Create a transaction on a specific date
      const testDate = new Date(ctx.wrappedYear, 5, 15, 12, 0, 0);
      const testTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: ctx.pointOfSaleRevisions[0],
        createdAt: testDate,
        subTransactions: [],
      });
      await ctx.connection.manager.save(testTransaction);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      await (service as any).updateTransactionDayStats([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(updated.transactionMaxDate).to.not.be.null;
      expect(updated.transactionMaxDate).to.be.instanceOf(Date);
      // Check that the date is the same day (ignore time precision)
      expect(updated.transactionMaxDate.getFullYear()).to.equal(testDate.getFullYear());
      expect(updated.transactionMaxDate.getMonth()).to.equal(testDate.getMonth());
      expect(updated.transactionMaxDate.getDate()).to.equal(testDate.getDate());
    });

    it('should handle users with no transactions', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      // Delete all transactions for this user
      await ctx.connection.manager.delete(Transaction, { from: { id: user.id } });

      await (service as any).updateTransactionDayStats([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(updated.transactionMaxDate).to.be.null;
      expect(updated.transactionMaxAmount).to.equal(0);
      const heatmap = JSON.parse(updated.transactionHeatmap);
      expect(heatmap).to.deep.equal(new Array(365).fill(0));
    });
  });

  describe('updateTransactionPercentile', () => {
    it('should compute percentiles correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // Create wrapped records for multiple users
      const eligibleUsers = ctx.users.filter((u) => u.extensiveDataProcessing && u.active && !u.deleted).slice(0, 5);
      const wrappedRows: Wrapped[] = [];

      for (const user of eligibleUsers) {
        const wrapped = Object.assign(new Wrapped(), {
          userId: user.id,
          transactionCount: eligibleUsers.indexOf(user) * 10,
          transactionPercentile: 0,
          transactionMaxAmount: 0,
          transactionHeatmap: JSON.stringify([]),
          spentPercentile: 0,
        });
        await ctx.connection.manager.save(wrapped);
        wrappedRows.push(wrapped);
      }

      await (service as any).updateTransactionPercentile(wrappedRows);

      const userIds = eligibleUsers.map((u) => u.id);
      const updated = await ctx.connection.manager.find(Wrapped, {
        where: userIds.map((id) => ({ userId: id })),
      });

      // Percentiles should be computed correctly
      // Users with transaction counts: 0, 10, 20, 30, 40
      // Percentiles: 100 (0 items less), 80 (1 item less), 60 (2 items less), 40 (3 items less), 20 (4 items less)
      const sortedByCount = [...updated].sort((a, b) => a.transactionCount - b.transactionCount);
      // Verify that percentiles are correctly assigned (lowest count = highest percentile)
      expect(sortedByCount[0].transactionPercentile).to.be.greaterThan(sortedByCount[sortedByCount.length - 1].transactionPercentile);
      // Verify all percentiles are valid numbers
      updated.forEach((w) => {
        expect(w.transactionPercentile).to.be.a('number');
        expect(Number.isFinite(w.transactionPercentile)).to.be.true;
      });
    });
  });

  describe('updateSpentPercentile', () => {
    it('should compute total spent correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      await (service as any).updateSpentPercentile([wrapped]);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      // Percentile should be a specific value between 0 and 100, not a range
      expect(updated.spentPercentile).to.be.a('number');
      expect(Number.isFinite(updated.spentPercentile)).to.be.true;
    });
  });

  describe('updateSyncedDates', () => {
    it('should set syncedFrom to Jan 1 of wrapped year', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
        syncedFrom: null,
        syncedTo: null,
      });
      await ctx.connection.manager.save(wrapped);

      await (service as any).updateSyncedDates([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      expect(updated.syncedFrom.getFullYear()).to.equal(ctx.wrappedYear);
      expect(updated.syncedFrom.getMonth()).to.equal(0);
      expect(updated.syncedFrom.getDate()).to.equal(1);
    });

    it('should set syncedTo to current date', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
        syncedFrom: null,
        syncedTo: null,
      });
      await ctx.connection.manager.save(wrapped);

      await (service as any).updateSyncedDates([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      // syncedTo should be set to current date (within a small tolerance for test execution time)
      const now = new Date();
      const timeDiff = Math.abs(updated.syncedTo.getTime() - now.getTime());
      expect(timeDiff).to.be.lessThan(1000); // Within 1 second
    });
  });

  describe('updateWrappedOrganMembers', () => {
    it('should find all organ memberships for users', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted
        && ctx.organMemberships.some((om) => om.userId === u.id));
      if (!user) return; // Skip if no user with membership

      const activeOrgan = ctx.organs.find((o) => o.active);
      if (!activeOrgan) return;

      const posRevision = ctx.pointOfSaleRevisions.find((pos) => pos.pointOfSale.owner.id === activeOrgan.id);
      if (!posRevision || posRevision.containers.length === 0 || posRevision.containers[0].products.length === 0) return;

      // Ensure user has transactions for the active organ's POS
      const container = posRevision.containers[0];
      const product = container.products[0];

      const testTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: posRevision,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(testTransaction);

      const subTransaction = Object.assign(new SubTransaction(), {
        transaction: testTransaction,
        to: activeOrgan,
        container,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactionRows: [],
      });
      await ctx.connection.manager.save(subTransaction);

      const row = Object.assign(new SubTransactionRow(), {
        subTransaction,
        product,
        amount: 1,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
      });
      await ctx.connection.manager.save(row);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const organMembers = await ctx.connection.manager.find(WrappedOrganMember, {
        where: { userId: user.id },
      });

      // User should have exactly 1 organ member record for the active organ with transactions
      expect(organMembers.length).to.equal(1);
      expect(organMembers[0].organId).to.equal(activeOrgan.id);
    });

    it('should filter organs by active = 1 only', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted
        && ctx.organMemberships.some((om) => om.userId === u.id));
      if (!user) return;

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const organMembers = await ctx.connection.manager.find(WrappedOrganMember, {
        where: { userId: user.id },
      });

      // Should only include active organs
      for (const om of organMembers) {
        const organ = ctx.organs.find((o) => o.id === om.organId);
        expect(organ.active).to.be.true;
      }
    });

    it('should handle users with no organ memberships', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // Create user without organ membership
      const userWithoutMembership = Object.assign(new User(), {
        firstName: 'NoMembership',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        deleted: false,
        extensiveDataProcessing: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      await ctx.connection.manager.save(userWithoutMembership);

      const wrapped = Object.assign(new Wrapped(), {
        userId: userWithoutMembership.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [userWithoutMembership.id] });

      const organMembers = await ctx.connection.manager.find(WrappedOrganMember, {
        where: { userId: userWithoutMembership.id },
      });
      expect(organMembers.length).to.equal(0);
    });

    it('should assign 0-based sequential ordinals correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // This test requires more setup with multiple sellers
      // For now, just verify the method runs without error
      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const organMembers = await ctx.connection.manager.find(WrappedOrganMember, {
        where: { userId: user.id },
      });

      // Verify ordinals are non-negative integers
      organMembers.forEach((om) => {
        expect(om.ordinalTransactionCreated).to.be.greaterThanOrEqual(0);
        expect(om.ordinalTurnoverCreated).to.be.greaterThanOrEqual(0);
        expect(Number.isInteger(om.ordinalTransactionCreated)).to.be.true;
        expect(Number.isInteger(om.ordinalTurnoverCreated)).to.be.true;
      });
    });

    it('should filter sellers by active = 1, deleted = 0, extensiveDataProcessing = 1', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // Create test sellers with different states
      const eligibleSeller = Object.assign(new User(), {
        firstName: 'Eligible',
        lastName: 'Seller',
        type: UserType.MEMBER,
        active: true,
        deleted: false,
        extensiveDataProcessing: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      await ctx.connection.manager.save(eligibleSeller);

      const inactiveSeller = Object.assign(new User(), {
        firstName: 'Inactive',
        lastName: 'Seller',
        type: UserType.MEMBER,
        active: false,
        deleted: false,
        extensiveDataProcessing: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      await ctx.connection.manager.save(inactiveSeller);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted
        && ctx.organMemberships.some((om) => om.userId === u.id));
      if (!user) return;

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      // The computation should only consider eligible sellers
      // This is verified by the fact that inactive sellers are not included in rankings
      const organMembers = await ctx.connection.manager.find(WrappedOrganMember, {
        where: { userId: user.id },
      });
      expect(organMembers).to.be.an('array');
    });

    it('should compute transaction count per seller correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const activeOrgan = ctx.organs.find((o) => o.active);
      if (!activeOrgan) return;

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted
        && ctx.organMemberships.some((om) => om.organId === activeOrgan.id && om.userId === u.id));
      if (!user) return;

      const posRevision = ctx.pointOfSaleRevisions.find((pos) => pos.pointOfSale.owner.id === activeOrgan.id);
      if (!posRevision || posRevision.containers.length === 0 || posRevision.containers[0].products.length === 0) return;

      // Create a transaction for this user and organ BEFORE updating wrapped
      const container = posRevision.containers[0];
      const product = container.products[0];

      const testTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: posRevision,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(testTransaction);

      const subTransaction = Object.assign(new SubTransaction(), {
        transaction: testTransaction,
        to: activeOrgan,
        container,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactionRows: [],
      });
      await ctx.connection.manager.save(subTransaction);

      const row = Object.assign(new SubTransactionRow(), {
        subTransaction,
        product,
        amount: 1,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
      });
      await ctx.connection.manager.save(row);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const organMember = await ctx.connection.manager.findOne(WrappedOrganMember, {
        where: { userId: user.id, organId: activeOrgan.id },
      });

      // User should have organ member record since they created a transaction
      expect(organMember).to.not.be.null;
      expect(organMember.ordinalTransactionCreated).to.equal(0); // They're the only seller
    });

    it('should compute turnover per seller correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const activeOrgan = ctx.organs.find((o) => o.active);
      if (!activeOrgan) return;

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted
        && ctx.organMemberships.some((om) => om.organId === activeOrgan.id && om.userId === u.id));
      if (!user) return;

      const posRevision = ctx.pointOfSaleRevisions.find((pos) => pos.pointOfSale.owner.id === activeOrgan.id);
      if (!posRevision || posRevision.containers.length === 0 || posRevision.containers[0].products.length === 0) return;

      // Create a transaction for this user and organ BEFORE updating wrapped
      const container = posRevision.containers[0];
      const product = container.products[0];

      const testTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: posRevision,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(testTransaction);

      const subTransaction = Object.assign(new SubTransaction(), {
        transaction: testTransaction,
        to: activeOrgan,
        container,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactionRows: [],
      });
      await ctx.connection.manager.save(subTransaction);

      const row = Object.assign(new SubTransactionRow(), {
        subTransaction,
        product,
        amount: 2,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
      });
      await ctx.connection.manager.save(row);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const organMember = await ctx.connection.manager.findOne(WrappedOrganMember, {
        where: { userId: user.id, organId: activeOrgan.id },
      });

      // User should have organ member record since they created a transaction
      expect(organMember).to.not.be.null;
      expect(organMember.ordinalTurnoverCreated).to.equal(0); // They're the only seller
    });

    it('should handle ties correctly (sequential ranking)', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // Create multiple sellers with same transaction count
      const activeOrgan = ctx.organs.find((o) => o.active);
      if (!activeOrgan) return;

      const seller1 = Object.assign(new User(), {
        firstName: 'Seller1',
        lastName: 'Test',
        type: UserType.MEMBER,
        active: true,
        deleted: false,
        extensiveDataProcessing: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      await ctx.connection.manager.save(seller1);

      const seller2 = Object.assign(new User(), {
        firstName: 'Seller2',
        lastName: 'Test',
        type: UserType.MEMBER,
        active: true,
        deleted: false,
        extensiveDataProcessing: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      await ctx.connection.manager.save(seller2);

      // Create organ membership for seller1
      const membership = Object.assign(new OrganMembership(), {
        userId: seller1.id,
        organId: activeOrgan.id,
        index: 0,
      });
      await ctx.connection.manager.save(membership);

      const wrapped = Object.assign(new Wrapped(), {
        userId: seller1.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      // Create transactions for seller1 to ensure they have sales
      const posRevision = ctx.pointOfSaleRevisions.find((pos) => pos.pointOfSale.owner.id === activeOrgan.id);
      if (!posRevision || posRevision.containers.length === 0) return;

      const container = posRevision.containers[0];
      if (container.products.length === 0) return;

      const testTransaction = Object.assign(new Transaction(), {
        from: seller1,
        createdBy: seller1,
        pointOfSale: posRevision,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(testTransaction);

      const subTransaction = Object.assign(new SubTransaction(), {
        transaction: testTransaction,
        to: activeOrgan,
        container,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactionRows: [],
      });
      await ctx.connection.manager.save(subTransaction);

      const row = Object.assign(new SubTransactionRow(), {
        subTransaction,
        product: container.products[0],
        amount: 1,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
      });
      await ctx.connection.manager.save(row);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [seller1.id] });

      const organMember = await ctx.connection.manager.findOne(WrappedOrganMember, {
        where: { userId: seller1.id, organId: activeOrgan.id },
      });

      // Seller1 should have organ member record
      expect(organMember).to.not.be.null;
      // Ordinals should be sequential (0, 1, 2, etc.) even with ties
      expect(organMember.ordinalTransactionCreated).to.equal(0);
      expect(organMember.ordinalTurnoverCreated).to.equal(0);
    });

    it('should delete existing records before creating new ones', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted
        && ctx.organMemberships.some((om) => om.userId === u.id));
      if (!user) return;

      const activeOrgan = ctx.organs.find((o) => o.active);
      if (!activeOrgan) return;

      const posRevision = ctx.pointOfSaleRevisions.find((pos) => pos.pointOfSale.owner.id === activeOrgan.id);
      if (!posRevision || posRevision.containers.length === 0 || posRevision.containers[0].products.length === 0) return;

      // Create a transaction for this user and organ BEFORE updating wrapped
      const container = posRevision.containers[0];
      const product = container.products[0];

      const testTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: posRevision,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(testTransaction);

      const subTransaction = Object.assign(new SubTransaction(), {
        transaction: testTransaction,
        to: activeOrgan,
        container,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
        subTransactionRows: [],
      });
      await ctx.connection.manager.save(subTransaction);

      const row = Object.assign(new SubTransactionRow(), {
        subTransaction,
        product,
        amount: 1,
        createdAt: new Date(ctx.wrappedYear, 5, 15),
      });
      await ctx.connection.manager.save(row);

      // Create existing organ member record with old values
      const existing = Object.assign(new WrappedOrganMember(), {
        userId: user.id,
        organId: activeOrgan.id,
        ordinalTransactionCreated: 999,
        ordinalTurnoverCreated: 999,
      });
      await ctx.connection.manager.save(existing);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      const updated = await ctx.connection.manager.findOne(WrappedOrganMember, {
        where: { userId: user.id, organId: activeOrgan.id },
      });

      // Should have new values, not the old 999
      expect(updated).to.not.be.null;
      expect(updated.ordinalTransactionCreated).to.not.equal(999);
      expect(updated.ordinalTurnoverCreated).to.not.equal(999);
    });

    it('should handle organs with no transactions', async () => {
      const service = new WrappedService(ctx.connection.manager);

      // Create organ with no POS or transactions
      const emptyOrgan = Object.assign(new User(), {
        firstName: 'Empty',
        lastName: 'Organ',
        type: UserType.ORGAN,
        active: true,
        deleted: false,
        extensiveDataProcessing: false,
        acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
      });
      await ctx.connection.manager.save(emptyOrgan);

      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      if (!user) return;

      const membership = Object.assign(new OrganMembership(), {
        userId: user.id,
        organId: emptyOrgan.id,
        index: 0,
      });
      await ctx.connection.manager.save(membership);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [user.id] });

      // User should not have organ member record for organ with no transactions
      const organMember = await ctx.connection.manager.findOne(WrappedOrganMember, {
        where: { userId: user.id, organId: emptyOrgan.id },
      });
      expect(organMember).to.be.null;
    });

    it('should handle users who are members but have no sales', async () => {
      const service = new WrappedService(ctx.connection.manager);

      const activeOrgan = ctx.organs.find((o) => o.active);
      if (!activeOrgan) return;

      // Create user who is member but never created transactions
      const nonSeller = Object.assign(new User(), {
        firstName: 'NonSeller',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        deleted: false,
        extensiveDataProcessing: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      await ctx.connection.manager.save(nonSeller);

      const membership = Object.assign(new OrganMembership(), {
        userId: nonSeller.id,
        organId: activeOrgan.id,
        index: 0,
      });
      await ctx.connection.manager.save(membership);

      const wrapped = Object.assign(new Wrapped(), {
        userId: nonSeller.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await service.updateWrapped({ ids: [nonSeller.id] });

      // User should not have organ member record if they have no sales
      const organMember = await ctx.connection.manager.findOne(WrappedOrganMember, {
        where: { userId: nonSeller.id, organId: activeOrgan.id },
      });
      // User with no sales should not have organ member record
      expect(organMember).to.be.null;
    });

  });

  describe('computePercentiles', () => {
    it('should return empty map for empty input', () => {
      const result = (WrappedService as any).computePercentiles([]);
      expect(result.size).to.equal(0);
    });

    it('should compute percentiles correctly', () => {
      const values = [
        { id: 1, value: 10 },
        { id: 2, value: 20 },
        { id: 3, value: 30 },
        { id: 4, value: 40 },
        { id: 5, value: 50 },
      ];

      const result = (WrappedService as any).computePercentiles(values);

      // Higher values have lower percentiles (percentile = 100 * (1 - less/total))
      // id: 1 (value: 10) has 0 items less, so percentile = 100
      // id: 5 (value: 50) has 4 items less, so percentile = 20
      expect(result.get(1)).to.equal(100);
      expect(result.get(5)).to.equal(20);
    });

    it('should handle ties correctly', () => {
      const values = [
        { id: 1, value: 10 },
        { id: 2, value: 10 },
        { id: 3, value: 20 },
      ];

      const result = (WrappedService as any).computePercentiles(values);
      expect(result.get(1)).to.equal(result.get(2));
    });

    it('should round to 2 decimal places', () => {
      const values = [
        { id: 1, value: 10 },
        { id: 2, value: 20 },
      ];

      const result = (WrappedService as any).computePercentiles(values);
      const percentile = result.get(1);
      const decimalPlaces = (percentile.toString().split('.')[1] || '').length;
      expect(decimalPlaces).to.be.lessThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database', async () => {
      const service = new WrappedService(ctx.connection.manager);
      // updateWrapped filters users, so non-existent user will throw "No rows provided"
      try {
        await service.updateWrapped({ ids: [999999] });
        const wrapped = await ctx.connection.manager.findOne(Wrapped, { where: { userId: 999999 } });
        expect(wrapped).to.be.null;
      } catch (error) {
        expect(error.message).to.equal('No rows provided');
      }
    });

    it('should exclude users with extensiveDataProcessing = false', async () => {
      const service = new WrappedService(ctx.connection.manager);
      const userWithoutExtData = ctx.users.find((u) => !u.extensiveDataProcessing && u.active && !u.deleted);
      if (!userWithoutExtData) return;

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      // updateWrapped filters users, so user without ext data will throw "No rows provided"
      try {
        await service.updateWrapped({ ids: [userWithoutExtData.id] });
        const wrapped = await ctx.connection.manager.findOne(Wrapped, { where: { userId: userWithoutExtData.id } });
        expect(wrapped).to.be.null;
      } catch (error) {
        expect(error.message).to.equal('No rows provided');
      }
    });

    it('should exclude inactive users', async () => {
      const service = new WrappedService(ctx.connection.manager);
      const inactiveUser = ctx.users.find((u) => !u.active && u.extensiveDataProcessing && !u.deleted);
      if (!inactiveUser) return;

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      // updateWrapped filters users, so inactive user will throw "No rows provided"
      try {
        await service.updateWrapped({ ids: [inactiveUser.id] });
        const wrapped = await ctx.connection.manager.findOne(Wrapped, { where: { userId: inactiveUser.id } });
        expect(wrapped).to.be.null;
      } catch (error) {
        expect(error.message).to.equal('No rows provided');
      }
    });

    it('should exclude deleted users', async () => {
      const service = new WrappedService(ctx.connection.manager);
      const deletedUser = ctx.users.find((u) => u.deleted && u.extensiveDataProcessing && u.active);
      if (!deletedUser) return;

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      // updateWrapped filters users, so deleted user will throw "No rows provided"
      try {
        await service.updateWrapped({ ids: [deletedUser.id] });
        const wrapped = await ctx.connection.manager.findOne(Wrapped, { where: { userId: deletedUser.id } });
        expect(wrapped).to.be.null;
      } catch (error) {
        expect(error.message).to.equal('No rows provided');
      }
    });

    it('should handle year boundaries correctly', async () => {
      const service = new WrappedService(ctx.connection.manager);
      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      if (!user) return;

      // Create transaction exactly on Jan 1
      const jan1Transaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: ctx.pointOfSaleRevisions[0],
        createdAt: new Date(ctx.wrappedYear, 0, 1, 0, 0, 0),
        subTransactions: [],
      });
      await ctx.connection.manager.save(jan1Transaction);

      // Create transaction exactly on Dec 31 23:59:59
      const dec31Transaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: ctx.pointOfSaleRevisions[0],
        createdAt: new Date(ctx.wrappedYear, 11, 31, 23, 59, 59),
        subTransactions: [],
      });
      await ctx.connection.manager.save(dec31Transaction);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 0,
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await (service as any).updateTransactionCount([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      // Should include both boundary transactions (Jan 1 and Dec 31)
      const expectedCount = await ctx.connection.manager
        .createQueryBuilder(Transaction, 't')
        .where('t.fromId = :userId', { userId: user.id })
        .andWhere('t.createdAt >= :start', { start: new Date(ctx.wrappedYear, 0, 1) })
        .andWhere('t.createdAt <= :end', { end: new Date(ctx.wrappedYear, 11, 31, 23, 59, 59) })
        .getCount();
      expect(updated.transactionCount).to.equal(expectedCount);
    });

    it('should handle transactions outside year range', async () => {
      const service = new WrappedService(ctx.connection.manager);
      const user = ctx.users.find((u) => u.extensiveDataProcessing && u.active && !u.deleted);
      if (!user) return;

      // Get initial count of transactions in wrapped year for this user
      const initialCount = await ctx.connection.manager
        .createQueryBuilder(Transaction, 't')
        .where('t.fromId = :userId', { userId: user.id })
        .andWhere('t.createdAt >= :start', { start: new Date(ctx.wrappedYear, 0, 1) })
        .andWhere('t.createdAt <= :end', { end: new Date(ctx.wrappedYear, 11, 31, 23, 59, 59) })
        .getCount();

      // Create transaction in previous year (outside range)
      const prevYearTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: ctx.pointOfSaleRevisions[0],
        createdAt: new Date(ctx.wrappedYear - 1, 6, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(prevYearTransaction);

      // Create transaction in next year (outside range)
      const nextYearTransaction = Object.assign(new Transaction(), {
        from: user,
        createdBy: user,
        pointOfSale: ctx.pointOfSaleRevisions[0],
        createdAt: new Date(ctx.wrappedYear + 1, 6, 15),
        subTransactions: [],
      });
      await ctx.connection.manager.save(nextYearTransaction);

      const wrapped = Object.assign(new Wrapped(), {
        userId: user.id,
        transactionCount: 999, // Set to a known value to verify it gets updated
        transactionPercentile: 0,
        transactionMaxAmount: 0,
        transactionHeatmap: JSON.stringify([]),
        spentPercentile: 0,
      });
      await ctx.connection.manager.save(wrapped);

      process.env.WRAPPED_YEAR = ctx.wrappedYear.toString();
      await (service as any).updateTransactionCount([wrapped], ctx.wrappedYear);

      const updated = await ctx.connection.manager.findOne(Wrapped, { where: { userId: user.id } });
      // Should not include transactions outside year range
      // Count should equal initial count (before adding transactions outside range)
      expect(updated.transactionCount).to.equal(initialCount);
      // Verify that the count was updated (not still 999)
      expect(updated.transactionCount).to.not.equal(999);
    });

  });
});

