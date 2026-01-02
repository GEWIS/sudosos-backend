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

import { defaultContext, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import User, { UserType } from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import SellerPayout from '../../../src/entity/transactions/payout/seller-payout';
import { expect, request } from 'chai';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { json } from 'body-parser';
import SellerPayoutController from '../../../src/controller/seller-payout-controller';
import {
  PaginatedSellerPayoutResponse,
  SellerPayoutResponse,
} from '../../../src/controller/response/seller-payout-response';
import { calculateBalance } from '../../helpers/balance';
import {
  CreateSellerPayoutRequest,
  UpdateSellerPayoutRequest,
} from '../../../src/controller/request/seller-payout-request';
import { ReportResponse } from '../../../src/controller/response/report-response';
import dinero from 'dinero.js';
import sinon from 'sinon';
import { Client } from 'pdf-generator-client';
import { BasePdfService } from '../../../src/service/pdf/pdf-service';
import {
  RbacSeeder,
  SellerPayoutSeeder, TransactionSeeder, TransferSeeder,
  UserSeeder,
} from '../../seed';
import { SELLER_PAYOUT_PDF_LOCATION } from '../../../src/files/storage';
import fs from 'fs';

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

    const users = await new UserSeeder().seed();

    const { transactions, subTransactions } = await new TransactionSeeder().seed(users, undefined, new Date('2020-01-01'), new Date());
    const transfers = await new TransferSeeder().seed(users, new Date('2020-01-01'), new Date());
    const { sellerPayouts, transfers: sellerPayoutTransfers } = await new SellerPayoutSeeder().seed(users, transactions, subTransactions, transfers);

    const all = { all: new Set<string>(['*']) };
    const adminRole = await new RbacSeeder().seed([{
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
    const adminToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(admin, adminRole), 'nonce admin');
    const userToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(user, adminRole), 'nonce');

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
      transfers: transfers.concat(sellerPayoutTransfers),
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
      let fromDate = ctx.sellerPayouts[0].endDate > ctx.sellerPayouts[1].endDate
        ? ctx.sellerPayouts[0].endDate
        : ctx.sellerPayouts[1].endDate;
      fromDate = new Date(fromDate.getTime() - 10000);

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.endDate > fromDate);
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
    });
    it('should return HTTP 200 when filtering on tillDate', async () => {
      let tillDate = ctx.sellerPayouts[0].startDate > ctx.sellerPayouts[1].startDate
        ? ctx.sellerPayouts[0].startDate
        : ctx.sellerPayouts[1].startDate;
      tillDate = new Date(tillDate.getTime() - 10000);

      const actualPayouts = ctx.sellerPayouts.filter((s) => s.startDate < tillDate);
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

  describe('GET /seller-payouts/{id}', () => {
    it('should return HTTP 200 and correct seller payout', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('SellerPayoutResponse', res.body, false, true);
      expect(validation.valid).to.be.true;

      const body = res.body as SellerPayoutResponse;
      expect(body.id).to.equal(sellerPayout.id);
      expect(body.createdAt).to.equal(sellerPayout.createdAt.toISOString());
      expect(body.updatedAt).to.equal(sellerPayout.updatedAt.toISOString());
      expect(body.requestedBy.id).to.equal(sellerPayout.requestedBy.id);
      expect(body.amount).to.deep.equal(sellerPayout.amount.toObject());
      expect(body.startDate).to.equal(sellerPayout.startDate.toISOString());
      expect(body.endDate).to.equal(sellerPayout.endDate.toISOString());
      expect(body.reference).to.equal(sellerPayout.reference);
    });
    it('should return HTTP 404 if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const res = await request(ctx.app)
        .get(`/seller-payouts/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Seller Payout not found.');
    });
    it('should return HTTP 403 if not admin', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /seller-payouts/{id}/report', () => {
    it('should return HTTP 200 with the sales report belonging to the seller payout', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('ReportResponse', res.body, false, true);
      expect(validation.valid).to.be.true;

      const body = res.body as ReportResponse;
      expect(body.totalInclVat.amount).equals(sellerPayout.amount.getAmount());
    });
    it('should return HTTP 404 if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const res = await request(ctx.app)
        .get(`/seller-payouts/${id}/report`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Seller Payout not found.');
    });
    it('should return HTTP 403 if not admin', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}/report`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /seller-payouts/{id}/report/pdf', () => {
    let clientStub: sinon.SinonStubbedInstance<Client>;

    function resolveSuccessful() {
      clientStub.generateDisbursement.resolves({
        data: new Blob(),
        status: 200,
      });
    }

    beforeEach(() => {
      clientStub = sinon.createStubInstance(Client);
      sinon.stub(BasePdfService, 'getClient').returns(clientStub);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should return HTTP 200 with the sales report PDF belonging to the seller payout', async () => {
      fs.mkdirSync(SELLER_PAYOUT_PDF_LOCATION, { recursive: true });
      resolveSuccessful();
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}/report/pdf`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
    });
    it('should return HTTP 404 if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const res = await request(ctx.app)
        .get(`/seller-payouts/${id}/report/pdf`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Seller Payout not found.');
    });
    it('should return HTTP 403 if not admin', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}/report/pdf`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should return HTTP 502 if pdf generation fails', async () => {
      clientStub.generateDisbursement.rejects(new Error('Failed to generate PDF'));
      const sellerPayout = await SellerPayout.findOne({ where: { id: 1 }, relations: ['requestedBy'] });
      const res = await request(ctx.app)
        .get(`/seller-payouts/${sellerPayout.id}/report/pdf`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ force: true });
      expect(res.status).to.equal(502);
    });
  });

  describe('POST /seller-payouts', () => {
    let organ: User;
    let req: CreateSellerPayoutRequest;

    before(() => {
      organ = ctx.users.find((u) => u.type === UserType.ORGAN
        && calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount() > 0);
      // Sanity check
      expect(organ).to.not.be.undefined;
      const startDate = new Date(0);
      const endDate = new Date();
      startDate.setMilliseconds(0);
      endDate.setMilliseconds(0);

      req = {
        requestedById: organ.id,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        reference: 'TEST CASE',
      };
    });

    it('should return HTTP 200 and new seller payout', async () => {
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('SellerPayoutResponse', res.body, false, true);
      expect(validation.valid).to.be.true;

      expect(await SellerPayout.count()).to.equal(ctx.sellerPayouts.length + 1);

      const body = res.body as SellerPayoutResponse;
      expect(body.requestedBy.id).to.equal(organ.id);
      expect(body.startDate).to.equal(req.startDate);
      expect(body.endDate).to.equal(req.endDate);
      expect(body.reference).to.equal(req.reference);

      const incomingTransactions = ctx.subTransactions.filter((s) => s.to.id === organ.id);
      const rows = incomingTransactions.map((s) => s.subTransactionRows).flat();
      // Calculate the total value of all incoming transactions
      const sellerPayoutValue = rows.reduce((total, r) => total.add(r.product.priceInclVat.multiply(r.amount)), dinero({ amount: 0 }));
      expect(body.amount.amount).to.equal(sellerPayoutValue.getAmount());

      // Cleanup
      const dbSellerPayout = await SellerPayout.findOne({ where: { id: body.id }, relations: { transfer: true } });
      await SellerPayout.remove(dbSellerPayout);
      await Transfer.remove(dbSellerPayout.transfer);
    });
    it('should return HTTP 400 if user does not exist', async () => {
      const invalidReq: CreateSellerPayoutRequest = {
        ...req,
        requestedById: 9999,
      };
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidReq);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('RequestedBy user not found.');
    });
    it('should return HTTP 400 if startDate is an invalid date', async () => {
      const invalidReq: CreateSellerPayoutRequest = {
        ...req,
        startDate: 'WieDitLeestMaaktSudoSOSAf',
      };
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidReq);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('StartDate is not a valid date.');
    });
    it('should return HTTP 400 if endDate is an invalid date', async () => {
      const invalidReq: CreateSellerPayoutRequest = {
        ...req,
        endDate: 'WieDitLeestMaaktSudoSOSAf',
      };
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidReq);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('EndDate is not a valid date.');
    });
    it('should return an HTTP 400 if startDate is after endDate', async () => {
      const invalidReq: CreateSellerPayoutRequest = {
        ...req,
        startDate: req.endDate,
        endDate: req.startDate,
      };
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidReq);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('EndDate cannot be before startDate.');
    });
    it('should return an HTTP 400 if endDate is in the future', async () => {
      const invalidReq: CreateSellerPayoutRequest = {
        ...req,
        endDate: new Date(new Date().getTime() + 60000).toISOString(),
      };
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidReq);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('EndDate cannot be in the future.');
    });
    it('should return an HTTP 400 if time window overlaps with other seller payout', async () => {
      const previousSellerPayout = ctx.sellerPayouts[0];
      const invalidReq: CreateSellerPayoutRequest = {
        ...req,
        requestedById: previousSellerPayout.requestedBy.id,
        startDate: new Date(previousSellerPayout.endDate.getTime() - 1000 * 60 * 60 * 24).toISOString(),
      };
      // Sanity check
      expect(new Date(invalidReq.startDate)).to.be.lessThan(previousSellerPayout.endDate);

      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidReq);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal(`New seller payout time window overlaps with the time windows of SellerPayouts "${previousSellerPayout.id}".`);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/seller-payouts')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(req);
      expect(res.status).to.equal(403);
    });
  });

  describe('PATCH /seller-payouts/{id}', () => {
    const req: UpdateSellerPayoutRequest = {
      amount: {
        amount: 3900,
        precision: 2,
        currency: 'EUR',
      },
    };

    it('should return HTTP 200 and update the seller payout', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .patch(`/seller-payouts/${sellerPayout.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('SellerPayoutResponse', res.body, false, true);
      expect(validation.valid).to.equal(true);

      const body = res.body as SellerPayoutResponse;
      expect(body.requestedBy.id).to.equal(sellerPayout.requestedBy.id);
      expect(body.startDate).to.equal(sellerPayout.startDate.toISOString());
      expect(body.endDate).to.equal(sellerPayout.endDate.toISOString());
      expect(body.reference).to.equal(sellerPayout.reference);
      expect(body.amount).to.deep.equal(req.amount);

      // Cleanup
      await SellerPayout.save(sellerPayout);
    });
    it('should return HTTP 404 if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const res = await request(ctx.app)
        .patch(`/seller-payouts/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Seller Payout not found.');
    });
    it('should return HTTP 403 if not admin', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .patch(`/seller-payouts/${sellerPayout.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(req);
      expect(res.status).to.equal(403);
    });
  });

  describe('DELETE /seller-payouts/{id}', () => {
    it('should return HTTP 204 and delete the seller payout', async () => {
      const sellerPayout = ctx.sellerPayouts[0];
      const res = await request(ctx.app)
        .delete(`/seller-payouts/${sellerPayout.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbSellerPayout = await SellerPayout.findOne({ where: { id: sellerPayout.id } });
      expect(dbSellerPayout).to.be.null;
      const dbTransfer = await Transfer.findOne({ where: { id: sellerPayout.transfer.id } });
      expect(dbTransfer).to.be.null;
    });
    it('should return HTTP 404 if seller payout does not exist', async () => {
      const id = ctx.sellerPayouts.length + 1;
      const res = await request(ctx.app)
        .delete(`/seller-payouts/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Seller Payout not found.');
    });
    it('should return HTTP 403 if not admin', async () => {
      const sellerPayout = ctx.sellerPayouts[1];
      const res = await request(ctx.app)
        .delete(`/seller-payouts/${sellerPayout.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });
});
