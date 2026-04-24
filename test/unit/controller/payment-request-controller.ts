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
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import PaymentRequestController from '../../../src/controller/payment-request-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { PaymentRequestSeeder } from '../../seed';
import PaymentRequest from '../../../src/entity/payment-request/payment-request';
import { PaymentRequestStatus } from '../../../src/entity/payment-request/payment-request-status';
import { ensureProductionRoles, signTokenFor } from '../../helpers/user-factory';
import { CreatePaymentRequestRequest } from '../../../src/controller/request/payment-request-request';
import { BasePaymentRequestResponse } from '../../../src/controller/response/payment-request-response';

describe('PaymentRequestController', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: PaymentRequestController,
    adminUser: User,
    localUser: User,
    otherUser: User,
    adminToken: string,
    userToken: string,
    otherUserToken: string,
    paymentRequests: PaymentRequest[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const adminUser = await User.save({
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    const localUser = await User.save({
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    const otherUser = await User.save({
      firstName: 'Other',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });

    // Seed 8 PaymentRequests — two per status, all with localUser as beneficiary
    // so the "own vs all" relation checks are exercisable.
    const paymentRequests = await new PaymentRequestSeeder().seed([localUser], adminUser, 8);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    await ensureProductionRoles();
    const roleManager = await new RoleManager().initialize();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await signTokenFor(adminUser, tokenHandler, 'nonce admin');
    const userToken = await signTokenFor(localUser, tokenHandler);
    const otherUserToken = await signTokenFor(otherUser, tokenHandler, 'nonce other');

    const controller = new PaymentRequestController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/payment-requests', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      otherUser,
      adminToken,
      userToken,
      otherUserToken,
      paymentRequests,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /payment-requests', () => {
    it('should return paginated list for admin', async () => {
      const res = await request(ctx.app)
        .get('/payment-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedBasePaymentRequestResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
      const records = res.body.records as BasePaymentRequestResponse[];
      expect(records.length).to.equal(ctx.paymentRequests.length);
    });

    it('scopes the listing to own requests when caller only has `get:own`', async () => {
      // Regular user has `get:own` but not `get:all` — the handler must force
      // `forId = self.id` regardless of what was asked for.
      const res = await request(ctx.app)
        .get('/payment-requests')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      const records = res.body.records as BasePaymentRequestResponse[];
      records.forEach((r) => {
        expect(r.for.id).to.equal(ctx.localUser.id);
      });
      // Seeder put all 8 requests on localUser as the beneficiary, so the
      // user should see all of them through the `own` path.
      expect(records.length).to.equal(ctx.paymentRequests.length);
    });

    it('ignores a spoofed forId when caller only has `get:own`', async () => {
      // Passing ?forId=<otherUser.id> must still be ignored — the handler
      // overrides forId to the caller's own id.
      const res = await request(ctx.app)
        .get('/payment-requests')
        .query({ forId: ctx.otherUser.id })
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      const records = res.body.records as BasePaymentRequestResponse[];
      records.forEach((r) => {
        expect(r.for.id).to.equal(ctx.localUser.id);
      });
    });

    it('returns an empty list for a caller with `get:own` who has no requests', async () => {
      // otherUser is a MEMBER (so has `get:own:PaymentRequest`), but none of
      // the seeded requests are for them — forId scoping yields zero rows.
      const res = await request(ctx.app)
        .get('/payment-requests')
        .set('Authorization', `Bearer ${ctx.otherUserToken}`);
      expect(res.status).to.equal(200);
      const records = res.body.records as BasePaymentRequestResponse[];
      expect(records.length).to.equal(0);
    });

    it('should filter by forId', async () => {
      const res = await request(ctx.app)
        .get('/payment-requests')
        .query({ forId: ctx.localUser.id })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const records = res.body.records as BasePaymentRequestResponse[];
      records.forEach((r) => {
        expect(r.for.id).to.equal(ctx.localUser.id);
      });
    });

    it('should filter by status=PAID', async () => {
      const res = await request(ctx.app)
        .get('/payment-requests')
        .query({ status: 'PAID' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const records = res.body.records as BasePaymentRequestResponse[];
      records.forEach((r) => {
        expect(r.status).to.equal(PaymentRequestStatus.PAID);
      });
      const expected = ctx.paymentRequests.filter(
        (p) => p.status === PaymentRequestStatus.PAID,
      ).length;
      expect(records.length).to.equal(expected);
    });

    it('should return 400 on unknown status token', async () => {
      const res = await request(ctx.app)
        .get('/payment-requests')
        .query({ status: 'BOGUS' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });

    it('should return 401 without bearer token', async () => {
      const res = await request(ctx.app).get('/payment-requests');
      expect(res.status).to.equal(401);
    });
  });

  describe('GET /payment-requests/:id', () => {
    it('should return own PaymentRequest for regular user', async () => {
      const own = ctx.paymentRequests[0];
      const res = await request(ctx.app)
        .get(`/payment-requests/${own.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.id).to.equal(own.id);
      expect(ctx.specification.validateModel(
        'BasePaymentRequestResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });

    it('should return 403 when another user tries to fetch someone else\'s request', async () => {
      // otherUser is not the beneficiary and has no `get:all:PaymentRequest` permission.
      const foreign = ctx.paymentRequests[0];
      const res = await request(ctx.app)
        .get(`/payment-requests/${foreign.id}`)
        .set('Authorization', `Bearer ${ctx.otherUserToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return 200 for admin regardless of ownership', async () => {
      const req = ctx.paymentRequests[0];
      const res = await request(ctx.app)
        .get(`/payment-requests/${req.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.id).to.equal(req.id);
    });

    it('should return 404 for unknown id', async () => {
      const res = await request(ctx.app)
        .get('/payment-requests/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /payment-requests', () => {
    const futureDate = (): string => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    it('should create a PaymentRequest for self (regular user)', async () => {
      const body: CreatePaymentRequestRequest = {
        forId: ctx.localUser.id,
        amount: { amount: 1250, precision: 2, currency: 'EUR' },
        expiresAt: futureDate(),
        description: 'Unit test self-create',
      };
      const res = await request(ctx.app)
        .post('/payment-requests')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(body);
      expect(res.status).to.equal(200);
      expect(res.body.for.id).to.equal(ctx.localUser.id);
      expect(res.body.amount.amount).to.equal(1250);
      expect(res.body.status).to.equal(PaymentRequestStatus.PENDING);
      expect(ctx.specification.validateModel(
        'BasePaymentRequestResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });

    it('should return 403 when regular user tries to create for someone else', async () => {
      const body: CreatePaymentRequestRequest = {
        forId: ctx.otherUser.id,
        amount: { amount: 500, precision: 2, currency: 'EUR' },
        expiresAt: futureDate(),
      };
      const res = await request(ctx.app)
        .post('/payment-requests')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(body);
      expect(res.status).to.equal(403);
    });

    it('should allow admin to create for any user', async () => {
      const body: CreatePaymentRequestRequest = {
        forId: ctx.otherUser.id,
        amount: { amount: 750, precision: 2, currency: 'EUR' },
        expiresAt: futureDate(),
      };
      const res = await request(ctx.app)
        .post('/payment-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(body);
      expect(res.status).to.equal(200);
      expect(res.body.for.id).to.equal(ctx.otherUser.id);
    });

    it('should return 404 when beneficiary user does not exist', async () => {
      const body: CreatePaymentRequestRequest = {
        forId: 999999,
        amount: { amount: 500, precision: 2, currency: 'EUR' },
        expiresAt: futureDate(),
      };
      const res = await request(ctx.app)
        .post('/payment-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(body);
      expect(res.status).to.equal(404);
    });

    it('should return 400 on invalid expiresAt', async () => {
      const body = {
        forId: ctx.localUser.id,
        amount: { amount: 500, precision: 2, currency: 'EUR' },
        expiresAt: 'not-a-date',
      };
      const res = await request(ctx.app)
        .post('/payment-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(body);
      expect(res.status).to.equal(400);
    });
  });

  // Seeder assigns statuses by `i % 4`: 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED.
  // With count=8 we have two rows per status. We use indices explicitly (rather
  // than `.find(status===X)`) so that tests which mutate state (cancel, mark-
  // fulfilled) don't cause the next `.find()` to return a stale reference.
  describe('POST /payment-requests/:id/cancel', () => {
    it('should cancel a PENDING request (admin)', async () => {
      const pending = ctx.paymentRequests[0]; // PENDING
      const res = await request(ctx.app)
        .post(`/payment-requests/${pending.id}/cancel`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal(PaymentRequestStatus.CANCELLED);
      expect(res.body.cancelledBy.id).to.equal(ctx.adminUser.id);
    });

    it('should return 409 when cancelling an already-cancelled request', async () => {
      const cancelled = ctx.paymentRequests[2]; // CANCELLED
      const res = await request(ctx.app)
        .post(`/payment-requests/${cancelled.id}/cancel`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(409);
    });

    it('should return 409 when cancelling a PAID request', async () => {
      const paid = ctx.paymentRequests[1]; // PAID
      const res = await request(ctx.app)
        .post(`/payment-requests/${paid.id}/cancel`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(409);
    });

    it('should return 404 for unknown id', async () => {
      const res = await request(ctx.app)
        .post('/payment-requests/00000000-0000-0000-0000-000000000000/cancel')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /payment-requests/:id/mark-fulfilled', () => {
    it('should mark a PENDING request as PAID with a Transfer', async () => {
      const pending = ctx.paymentRequests[4]; // PENDING (second one, index 0 was cancelled above)
      const res = await request(ctx.app)
        .post(`/payment-requests/${pending.id}/mark-fulfilled`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ reason: 'bank transfer 2026-04-23' });
      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal(PaymentRequestStatus.PAID);
      expect(res.body.paidAt).to.not.be.null;
      // The admin performing the escape hatch is recorded for audit.
      expect(res.body.fulfilledBy).to.not.be.null;
      expect(res.body.fulfilledBy.id).to.equal(ctx.adminUser.id);
    });

    it('should return 400 on empty reason', async () => {
      // Body check runs before state check, so any id works.
      const target = ctx.paymentRequests[3]; // EXPIRED
      const res = await request(ctx.app)
        .post(`/payment-requests/${target.id}/mark-fulfilled`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ reason: '   ' });
      expect(res.status).to.equal(400);
    });

    it('should return 403 for non-admin (mark-fulfilled requires update:all)', async () => {
      const target = ctx.paymentRequests[3]; // EXPIRED
      const res = await request(ctx.app)
        .post(`/payment-requests/${target.id}/mark-fulfilled`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ reason: 'trying' });
      expect(res.status).to.equal(403);
    });

    it('should return 409 when request is already PAID', async () => {
      const paid = ctx.paymentRequests[5]; // PAID (second one)
      const res = await request(ctx.app)
        .post(`/payment-requests/${paid.id}/mark-fulfilled`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ reason: 'late fallback' });
      expect(res.status).to.equal(409);
    });
  });
});
