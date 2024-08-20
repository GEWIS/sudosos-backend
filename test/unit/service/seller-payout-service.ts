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
import User from '../../../src/entity/user/user';
import database, { AppDataSource } from '../../../src/database/database';
import {
  seedContainers, seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions, seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import { finishTestDB } from '../../helpers/test-helpers';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import SellerPayout from '../../../src/entity/transactions/payout/seller-payout';
import { seedSellerPayouts } from '../../seed/seller-payout';
import { expect } from 'chai';
import SellerPayoutService from '../../../src/service/seller-payout-service';

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

    const { transactions, subTransactions } = await seedTransactions(users, pointOfSaleRevisions);
    const transfers = await seedTransfers(users);
    const { sellerPayouts } = await seedSellerPayouts(users, transactions, subTransactions, transfers);

    ctx = {
      connection,
      users,
      transactions,
      subTransactions,
      transfers,
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
      let fromDate = ctx.sellerPayouts[0].createdAt < ctx.sellerPayouts[1].createdAt
        ? ctx.sellerPayouts[0].createdAt
        : ctx.sellerPayouts[1].createdAt;
      fromDate = new Date(fromDate.getTime() + 60000);

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.createdAt >= fromDate);
      const service = new SellerPayoutService();
      const [sellerPayouts, count] = await service.getSellerPayouts({
        fromDate,
      });

      // Sanity check
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
      tillDate = new Date(tillDate.getTime() - 60000);

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.createdAt < tillDate);
      const service = new SellerPayoutService();
      const [sellerPayouts, count] = await service.getSellerPayouts({
        tillDate,
      });

      // Sanity check
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
});
