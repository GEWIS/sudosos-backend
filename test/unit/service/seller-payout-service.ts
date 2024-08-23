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
import { DataSource } from 'typeorm';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import User, { UserType } from '../../../src/entity/user/user';
import database from '../../../src/database/database';
import {
  seedContainers,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions,
  seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import { finishTestDB } from '../../helpers/test-helpers';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import SellerPayout from '../../../src/entity/transactions/payout/seller-payout';
import { seedSellerPayouts } from '../../seed/seller-payout';
import { expect } from 'chai';
import SellerPayoutService, { CreateSellerPayoutParams } from '../../../src/service/seller-payout-service';
import { calculateBalance } from '../../helpers/balance';
import { DineroObjectRequest } from '../../../src/controller/request/dinero-request';

describe('SellerPayoutService', () => {
  let ctx: {
    connection: DataSource;
    users: User[];
    transactions: Transaction[];
    subTransactions: SubTransaction[];
    transfers: Transfer[];
    sellerPayouts: SellerPayout[];
  };

  before(async () => {
    const connection = await database.initialize();
    const users = await seedUsers();

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);

    const { transactions, subTransactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-01-01'), new Date());
    const transfers = await seedTransfers(users, new Date('2020-01-01'), new Date());
    const { sellerPayouts, transfers: sellerPayoutTransfers } = await seedSellerPayouts(users, transactions, subTransactions, transfers);

    ctx = {
      connection,
      users,
      transactions,
      subTransactions,
      transfers: transfers.concat(sellerPayoutTransfers),
      sellerPayouts,
    };

    // Sanity check
    expect(sellerPayouts.length).to.be.at.least(2);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#getSellerPayouts', () => {
    it('should return all sellerPayouts', async () => {
      const service = new SellerPayoutService();
      const [sellerPayouts, count] = await service.getSellerPayouts({});

      expect(sellerPayouts).to.be.lengthOf(count);
      const ids = sellerPayouts.map((s) => s.id);
      expect(ids).to.deep.equalInAnyOrder(ctx.sellerPayouts.map((s) => s.id));
      sellerPayouts.forEach((sellerPayout) => {
        expect(sellerPayout.transfer).to.be.undefined;
      });
    });
    it('should return seller payouts by filtered by id', async () => {
      const sellerPayout = ctx.sellerPayouts[0];

      const service = new SellerPayoutService();
      const [sellerPayouts] = await service.getSellerPayouts({
        sellerPayoutId: sellerPayout.id,
      });

      expect(sellerPayouts).to.be.lengthOf(1);
      expect(sellerPayouts[0].id).to.equal(sellerPayout.id);
    });
    it('should return seller payouts filtered by user', async () => {
      const service = new SellerPayoutService();
      const [sellerPayouts] = await service.getSellerPayouts({
        requestedById: ctx.sellerPayouts[0].requestedBy.id,
      });

      expect(sellerPayouts).to.be.lengthOf(1);
      expect(sellerPayouts[0].requestedBy.id).to.equal(ctx.sellerPayouts[0].requestedBy.id);
    });
    it('should return seller payouts created after a date', async () => {
      const fromDate = ctx.sellerPayouts[0].createdAt > ctx.sellerPayouts[1].createdAt
        ? ctx.sellerPayouts[0].createdAt
        : ctx.sellerPayouts[1].createdAt;

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.createdAt >= fromDate);
      const service = new SellerPayoutService();
      const [sellerPayouts, count] = await service.getSellerPayouts({
        fromDate,
      });

      // Sanity check
      expect(actualPayouts.length).to.be.at.least(1);
      expect(actualPayouts.length).to.not.equal(ctx.sellerPayouts.length);

      expect(sellerPayouts.length).to.equal(actualPayouts.length);
      expect(sellerPayouts.length).to.equal(count);
      sellerPayouts.forEach((s) => {
        expect(s.createdAt).to.be.greaterThanOrEqual(fromDate);
      });
    });
    it('should return seller payouts created before a date', async () => {
      let tillDate = ctx.sellerPayouts[0].createdAt > ctx.sellerPayouts[1].createdAt
        ? ctx.sellerPayouts[0].createdAt
        : ctx.sellerPayouts[1].createdAt;
      tillDate = new Date(tillDate.getTime());

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.createdAt < tillDate);
      const service = new SellerPayoutService();
      const [sellerPayouts, count] = await service.getSellerPayouts({
        tillDate,
      });

      // Sanity check
      expect(actualPayouts.length).to.be.at.least(1);
      expect(actualPayouts.length).to.not.equal(ctx.sellerPayouts.length);

      expect(sellerPayouts.length).to.equal(actualPayouts.length);
      expect(sellerPayouts.length).to.equal(count);
      sellerPayouts.forEach((s) => {
        expect(s.createdAt).to.be.lessThan(tillDate);
      });
    });
    it('should return seller payouts with transfers', async () => {
      const service = new SellerPayoutService();
      const [sellerPayouts] = await service.getSellerPayouts({
        returnTransfer: true,
      });

      sellerPayouts.forEach((sellerPayout) => {
        expect(sellerPayout.transfer).to.not.be.undefined;
      });
    });
  });

  describe('#createSellerPayout', async () => {
    it('should create a seller payout', async () => {
      const organ = ctx.users.find((u) => u.type === UserType.ORGAN
        && calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount() > 0);
      // Sanity check
      expect(organ).to.not.be.undefined;

      const service = new SellerPayoutService();
      const params: CreateSellerPayoutParams = {
        startDate: new Date(0),
        endDate: new Date(),
        requestedById: organ.id,
        reference: 'TEST',
      };
      const sellerPayout = await service.createSellerPayout(params);

      // Somehow a ~200ms difference between two dates, so just round to seconds
      const expectedStartDate = Math.round(params.startDate.getTime() / 1000);
      const expectedEndDate = Math.round(params.endDate.getTime() / 1000);
      const actualStartDate = Math.round(sellerPayout.startDate.getTime() / 1000);
      const actualEndDate = Math.round(sellerPayout.endDate.getTime() / 1000);

      expect(actualStartDate).to.equal(expectedStartDate);
      expect(actualEndDate).to.equal(expectedEndDate);
      expect(sellerPayout.reference).to.equal(params.reference);
      expect(sellerPayout.requestedBy.id).to.equal(params.requestedById);
      expect(sellerPayout.transfer).to.not.be.undefined;
      expect(sellerPayout.transfer.fromId).to.equal(params.requestedById);
      expect(sellerPayout.transfer.toId).to.be.null;

      // TODO: calculate amount based on transaction reporting
      expect(sellerPayout.amount.getAmount()).to.equal(0);
      expect(sellerPayout.amount.getAmount()).to.equal(sellerPayout.transfer.amountInclVat.getAmount());

      // Cleanup
      await SellerPayout.remove(sellerPayout);
      await Transfer.remove(sellerPayout.transfer);
    });
    it('should throw an error when user does not exist', async () => {
      const service = new SellerPayoutService();
      const params: CreateSellerPayoutParams = {
        startDate: new Date(0),
        endDate: new Date(),
        requestedById: ctx.users.length + 1000,
        reference: 'TEST',
      };
      await expect(service.createSellerPayout(params)).to.eventually.be
        .rejectedWith(`User with ID "${params.requestedById}" not found.`);
    });
  });

  describe('#updateSellerPayout', () => {
    it('should update seller payout', async () => {
      const oldSellerPayout = ctx.sellerPayouts[0];

      const amount: DineroObjectRequest = {
        amount: oldSellerPayout.amount.getAmount() + 100,
        precision: oldSellerPayout.amount.getPrecision(),
        currency: oldSellerPayout.amount.getCurrency(),
      };

      const service = new SellerPayoutService();
      const sellerPayout = await service.updateSellerPayout(oldSellerPayout.id, {
        amount,
      });

      expect(sellerPayout.amount.getAmount()).to.equal(amount.amount);
      expect(sellerPayout.transfer.amountInclVat.getAmount()).to.equal(amount.amount);

      // Cleanup
      await SellerPayout.save(oldSellerPayout);
    });
    it('should throw if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const service = new SellerPayoutService();
      await expect(service.updateSellerPayout(id, { amount: ctx.sellerPayouts[0].amount.toObject() }))
        .to.eventually.be.rejectedWith(`Payout with ID "${id}" not found.`);
    });
  });

  describe('#deleteSellerPayout', () => {
    it('should delete a seller payout with its transfer', async () => {
      const payout = ctx.sellerPayouts[0];

      const service = new SellerPayoutService();
      await service.deleteSellerPayout(payout.id);

      const dbPayout = await SellerPayout.findOne({ where: { id: payout.id } });
      const dbTransfer = await Transfer.findOne({ where: { id: payout.transfer.id } });
      expect(dbPayout).to.be.null;
      expect(dbTransfer).to.be.null;
    });
    it('should throw if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const service = new SellerPayoutService();
      await expect(service.deleteSellerPayout(id)).to.eventually.be
        .rejectedWith(`Payout with ID "${id}" not found.`);
    });
  });
});