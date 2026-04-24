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
import PaymentRequestPublicController from '../../../src/controller/payment-request-public-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { PaymentRequestSeeder } from '../../seed';
import PaymentRequest from '../../../src/entity/payment-request/payment-request';
import { PaymentRequestStatus } from '../../../src/entity/payment-request/payment-request-status';
import { PublicPaymentRequestResponse } from '../../../src/controller/response/payment-request-response';

describe('PaymentRequestPublicController', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: PaymentRequestPublicController,
    adminUser: User,
    localUser: User,
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
      lastName: 'Doe',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });

    // 8 requests → 2 per derived status.
    const paymentRequests = await new PaymentRequestSeeder().seed([localUser], adminUser, 8);

    const app = express();
    const specification = await Swagger.initialize(app);
    const roleManager = await new RoleManager().initialize();

    const controller = new PaymentRequestPublicController({ specification, roleManager });
    app.use(json());
    // Public controller bypasses token middleware — mounted before setupAuthentication in src/index.ts
    app.use('/payment-requests-public', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      paymentRequests,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /payment-requests-public/:id', () => {
    it('should return a trimmed PublicPaymentRequestResponse for a PENDING request', async () => {
      const pending = ctx.paymentRequests[0]; // PENDING per seeder i%4 mapping
      const res = await request(ctx.app).get(`/payment-requests-public/${pending.id}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PublicPaymentRequestResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as PublicPaymentRequestResponse;
      expect(body.id).to.equal(pending.id);
      expect(body.status).to.equal(PaymentRequestStatus.PENDING);
      expect(body.forDisplayName).to.equal(User.fullName(ctx.localUser));
    });

    it('should omit createdBy/cancelledBy/paidAt audit fields', async () => {
      const cancelled = ctx.paymentRequests[2]; // CANCELLED
      const res = await request(ctx.app).get(`/payment-requests-public/${cancelled.id}`);
      expect(res.status).to.equal(200);
      // Response must NOT leak the admin that cancelled, the full createdBy, etc.
      expect(res.body.createdBy).to.be.undefined;
      expect(res.body.cancelledBy).to.be.undefined;
      expect(res.body.cancelledAt).to.be.undefined;
      expect(res.body.paidAt).to.be.undefined;
      expect(res.body.status).to.equal(PaymentRequestStatus.CANCELLED);
    });

    it('should return 404 for unknown id', async () => {
      const res = await request(ctx.app).get(
        '/payment-requests-public/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).to.equal(404);
    });

    it('should NOT require a bearer token', async () => {
      // Same request, no Authorization header — must still succeed.
      const pending = ctx.paymentRequests[0];
      const res = await request(ctx.app).get(`/payment-requests-public/${pending.id}`);
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /payment-requests-public/:id/start', () => {
    it('should return 404 for unknown id', async () => {
      const res = await request(ctx.app).post(
        '/payment-requests-public/00000000-0000-0000-0000-000000000000/start',
      );
      expect(res.status).to.equal(404);
    });

    // The service rejects non-PENDING requests before any Stripe call, so these
    // 409 cases do not depend on Stripe credentials being present.
    it('should return 409 when request is CANCELLED', async () => {
      const cancelled = ctx.paymentRequests[2];
      const res = await request(ctx.app).post(
        `/payment-requests-public/${cancelled.id}/start`,
      );
      expect(res.status).to.equal(409);
    });

    it('should return 409 when request is PAID', async () => {
      const paid = ctx.paymentRequests[1];
      const res = await request(ctx.app).post(
        `/payment-requests-public/${paid.id}/start`,
      );
      expect(res.status).to.equal(409);
    });

    it('should return 409 when request is EXPIRED', async () => {
      const expired = ctx.paymentRequests[3];
      const res = await request(ctx.app).post(
        `/payment-requests-public/${expired.id}/start`,
      );
      expect(res.status).to.equal(409);
    });
  });
});
