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
import { defaultContext, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import User, { UserType } from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import SellerPayout from '../../../src/entity/transactions/payout/seller-payout';
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
import { seedSellerPayouts } from '../../seed/seller-payout';
import { expect, request } from 'chai';
import { getToken, seedRoles } from '../../seed/rbac';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { json } from 'body-parser';
import SellerPayoutController from '../../../src/controller/seller-payout-controller';
import { PaginatedSellerPayoutResponse } from '../../../src/controller/response/seller-payout-response';

describe('SellerPayoutController', () => {
  let ctx: DefaultContext & {
    users: User[];
    transactions: Transaction[];
    subTransactions: SubTransaction[];
    transfers: Transfer[];
    sellerPayouts: SellerPayout[];
    admin: User;
    adminToken: string;
    user: User;
    userToken: string;
  };

  before(async () => {
    const c = { ...await defaultContext() };

    const users = await seedUsers();

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);

    const { transactions, subTransactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-01-01'), new Date());
    const transfers = await seedTransfers(users, new Date('2020-01-01'), new Date());
    const { sellerPayouts } = await seedSellerPayouts(users, transactions, subTransactions, transfers);

    const all = { all: new Set<string>(['*']) };
    const adminRole = await seedRoles([{
      name: 'Admin',
      permissions: {
        SellerPayout: {
          get: all,
          create: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);

    const admin = users.find((u) => u.type === UserType.LOCAL_ADMIN);
    const user = users.find((u) => u.type === UserType.LOCAL_USER);
    const adminToken = await c.tokenHandler.signToken(await getToken(admin, adminRole), 'nonce admin');
    const userToken = await c.tokenHandler.signToken(await getToken(user, adminRole), 'nonce');

    const tokenMiddleware = new TokenMiddleware({ tokenHandler: c.tokenHandler, refreshFactor: 0.5 }).getMiddleware();
    c.app.use(json());
    c.app.use(tokenMiddleware);
    const controller = new SellerPayoutController({ specification: c.specification, roleManager: c.roleManager });
    c.app.use('/seller-payouts', controller.getRouter());

    ctx = {
      ...c,
      users,
      transactions,
      subTransactions,
      transfers,
      sellerPayouts,
      admin,
      adminToken,
      user,
      userToken,
    };

    // Sanity check
    expect(sellerPayouts.length).to.be.at.least(2);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /seller-payouts', () => {
    it('should return HTTP 200 with all seller payouts', async () => {
      const res = await request(ctx.app)
        .get('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('PaginatedSellerPayoutResponse', res.body, false, true);
      expect(validation.valid).to.be.true;

      const sellerPayouts = res.body as PaginatedSellerPayoutResponse;
      expect(sellerPayouts.records).to.be.lengthOf(ctx.sellerPayouts.length);
      expect(sellerPayouts.records.map((r) => r.id)).to.deep.equalInAnyOrder(ctx.sellerPayouts.map((r) => r.id));
    });
    it('should return HTTP 200 when filtering on user', async () => {
      const user = ctx.sellerPayouts[0].requestedBy;
      const res = await request(ctx.app)
        .get(`/seller-payouts?requestedById=${user.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.requestedBy.id === user.id);
      const response = res.body as PaginatedSellerPayoutResponse;
      expect(response.records.map((s) => s.id)).to.deep
        .equalInAnyOrder(actualPayouts.map((s) => s.id));
      response.records.forEach((s) => {
        expect(s.requestedBy.id).to.equal(user.id);
      });
    });
    it('should return HTTP 200 when filtering on fromDate', async () => {
      const fromDate = ctx.sellerPayouts[0].createdAt > ctx.sellerPayouts[1].createdAt
        ? ctx.sellerPayouts[0].createdAt
        : ctx.sellerPayouts[1].createdAt;

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.createdAt >= fromDate);
      // Sanity check
      expect(actualPayouts.length).to.be.at.least(1);
      expect(actualPayouts.length).to.not.equal(ctx.sellerPayouts.length);

      const res = await request(ctx.app)
        .get(`/seller-payouts?fromDate=${fromDate.toISOString()}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const response = res.body as PaginatedSellerPayoutResponse;
      expect(response.records.map((s) => s.id)).to.deep
        .equalInAnyOrder(actualPayouts.map((s) => s.id));
      response.records.forEach((s) => {
        expect(new Date(s.createdAt)).to.be.greaterThanOrEqual(fromDate);
      });
    });
    it('should return HTTP 200 when filtering on tillDate', async () => {
      const tillDate = ctx.sellerPayouts[0].createdAt > ctx.sellerPayouts[1].createdAt
        ? ctx.sellerPayouts[0].createdAt
        : ctx.sellerPayouts[1].createdAt;

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.createdAt < tillDate);
      // Sanity check
      expect(actualPayouts.length).to.be.at.least(1);
      expect(actualPayouts.length).to.not.equal(ctx.sellerPayouts.length);

      const res = await request(ctx.app)
        .get(`/seller-payouts?tillDate=${tillDate.toISOString()}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const response = res.body as PaginatedSellerPayoutResponse;
      expect(response.records.map((s) => s.id)).to.deep
        .equalInAnyOrder(actualPayouts.map((s) => s.id));
      response.records.forEach((s) => {
        expect(new Date(s.createdAt)).to.be.lessThan(tillDate);
      });
    });
    it('should return HTTP 200 and adhere to pagination', async () => {
      const skip = 1;
      const take = 2;
      const res = await request(ctx.app)
        .get(`/seller-payouts?take=${take}&skip=${skip}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const response = res.body as PaginatedSellerPayoutResponse;
      expect(response._pagination.skip).to.equal(skip);
      expect(response._pagination.take).to.equal(take);
      expect(response.records.length).to.be.at.most(take);
      expect(response._pagination.count).to.equal(ctx.sellerPayouts.length);
    });
    it('should return HTTP 400 if invalid pagination', async () => {
      const res = await request(ctx.app)
        .get('/seller-payouts?take=Yeet')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid pagination parameters');
    });
    it('should return HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });
});
