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
import chai from 'chai';

import StripeController from '../../../src/controller/stripe-controller';
import User, { UserType } from '../../../src/entity/user/user';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import Database from '../../../src/database/database';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { StripeRequest } from '../../../src/controller/request/stripe-request';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripePaymentIntentResponse } from '../../../src/controller/response/stripe-response';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import { DepositSeeder } from '../../seed';
import { ensureProductionRoles, signTokenFor } from '../../helpers/user-factory';
import sinon from 'sinon';
import Config from '../../../src/config';
import StripeSettlementReportPdfService from '../../../src/service/pdf/stripe-settlement-report-pdf-service';

const { expect, request } = chai;

const shouldSkipStripe = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
  || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);

describe.skipIf(shouldSkipStripe)('StripeController', async (): Promise<void> => {
  let originalName: string;

  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: StripeController,
    stripe: Stripe,
    serviceName: string,
    localUser: User,
    adminUser: User,
    userToken: string,
    adminToken: string,
    stripeDeposits: StripeDeposit[],
    validStripeRequest: StripeRequest;
    minimumStripeRequest: StripeRequest;
    maximumStripeRequest: StripeRequest;
  };

  beforeAll(async () => {
    originalName = process.env.NAME;
    const serviceName = 'sudosos-stripe-test-suite';
    process.env.NAME = serviceName;

    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });

    const adminUser = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      tosRequired: true,
    });
    const localUser = await User.save({
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      tosRequired: true,
    });

    const { stripeDeposits } = await new DepositSeeder().seed([localUser, adminUser]);

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

    const controller = new StripeController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/stripe', controller.getRouter());

    // Valid Stripe deposit initiation request
    const validDinero = DineroTransformer.Instance.from(1950);
    const validStripeRequest: StripeRequest = {
      amount: validDinero.toObject(),
    };

    // Too low Stripe deposit initiation request
    const minimumDinero = DineroTransformer.Instance.from(500);
    const minimumStripeRequest: StripeRequest = {
      amount: minimumDinero.toObject(),
    };

    // Too high Stripe deposit initiation request
    const maximumDinero = DineroTransformer.Instance.from(15600);
    const maximumStripeRequest: StripeRequest = {
      amount: maximumDinero.toObject(),
    };

    ctx = {
      connection,
      app,
      specification,
      controller,
      stripe,
      serviceName,
      adminUser,
      localUser,
      adminToken,
      userToken,
      stripeDeposits,
      validStripeRequest,
      minimumStripeRequest,
      maximumStripeRequest,
    };
  });

  afterAll(async () => {
    process.env.NAME = originalName;
    await finishTestDB(ctx.connection);
  });

  describe('POST /deposit', () => {
    it('should return an HTTP 200, create a stripeDeposit and store it in the database', async () => {
      const stripeDepositCount = await StripeDeposit.count();
      const res = await request(ctx.app)
        .post('/stripe/deposit')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validStripeRequest);

      const paymentIntent = res.body as StripePaymentIntentResponse;

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'StripePaymentIntentResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
      expect(await StripeDeposit.count()).to.equal(stripeDepositCount + 1);

      ctx.specification.validateModel('StripePaymentIntentResponse', paymentIntent);
      const stripeDeposit = await StripeDeposit.findOne({ where: { id: paymentIntent.id }, relations: {
        to: true,
      } });
      expect(ctx.localUser.id).to.equal(stripeDeposit.to.id);

      const stripePaymentIntent = await ctx.stripe.paymentIntents.retrieve(paymentIntent.stripeId);
      expect(stripePaymentIntent).to.not.be.null;
      expect(stripePaymentIntent.amount).to.equal(ctx.validStripeRequest.amount.amount);
      // Correct description
      expect(stripePaymentIntent.description).to.equal(`SudoSOS deposit of ${ctx.validStripeRequest.amount.currency} ${(ctx.validStripeRequest.amount.amount / 100).toFixed(2)} for ${User.fullName(ctx.localUser)}.`);
      // Correct metadata
      expect(stripePaymentIntent.metadata).to.deep.equal({
        service: ctx.serviceName,
        userId: ctx.localUser.id.toString(),
      });
    });
    it('should return an HTTP 422 if deposit request amount is too low', async () => {
      const res = await request(ctx.app)
        .post('/stripe/deposit')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.minimumStripeRequest);

      expect(res.status).to.equal(422);
      expect(res.body).to.deep.equal({
        error: 'Top-up amount is too low',
      });
    });
    it('should return an HTTP 422 if deposit request amount is too high', async () => {
      const res = await request(ctx.app)
        .post('/stripe/deposit')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.maximumStripeRequest);

      expect(res.status).to.equal(422);
      expect(res.body).to.deep.equal({
        error: 'Top-up amount is too high',
      });
    });
    it('should return an HTTP 401 if no Bearer token provided', async () => {
      const res = await request(ctx.app)
        .post('/stripe/deposit')
        .send(ctx.validStripeRequest);

      expect(res.status).to.equal(401);
    });
  });
});

// A separate, un-skipped suite: the report endpoints never call the real
// Stripe API, so they should not depend on real Stripe keys being configured.
// Mirrors the fake-key setup TerminalPaymentController's own test file uses
// for the same reason.
describe('StripeController - settlement report', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    adminToken: string,
    posToken: string,
  };
  let originalStripeKey: string | undefined;

  beforeAll(async () => {
    originalStripeKey = process.env.STRIPE_PRIVATE_KEY;
    process.env.STRIPE_PRIVATE_KEY = process.env.STRIPE_PRIVATE_KEY || 'sk_test_dummy';
    Config.reset();

    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const adminUser = await User.save({
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      tosRequired: false,
    } as User);
    // A POS user's own role only has TerminalPayment:get:own and no
    // StripeDeposit permission at all, so it must fail both halves of the
    // combined report's policy.
    const posUser = await User.save({
      firstName: 'Bar',
      type: UserType.POINT_OF_SALE,
      active: true,
      tosRequired: false,
    } as User);

    const app = express();
    const specification = await Swagger.initialize(app);

    await ensureProductionRoles();
    const roleManager = await new RoleManager().initialize();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await signTokenFor(adminUser, tokenHandler, 'nonce admin');
    const posToken = await signTokenFor(posUser, tokenHandler, 'nonce pos');

    const controller = new StripeController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/stripe', controller.getRouter());

    ctx = { connection, app, specification, adminToken, posToken };
  });

  afterAll(async () => {
    process.env.STRIPE_PRIVATE_KEY = originalStripeKey;
    Config.reset();
    await finishTestDB(ctx.connection);
  });

  describe('GET /stripe/report', () => {
    it('should return 200 and a valid report for an admin', async () => {
      const res = await request(ctx.app)
        .get('/stripe/report')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate: new Date(0), toDate: new Date() });

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel('StripeSettlementReportResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.deposits).to.have.property('count');
      expect(res.body.terminalPayments).to.have.property('count');
      expect(res.body.total).to.have.property('count');
    });
    it('should return 403 for a POS token, which has neither required permission', async () => {
      const res = await request(ctx.app)
        .get('/stripe/report')
        .set('Authorization', `Bearer ${ctx.posToken}`)
        .query({ fromDate: new Date(0), toDate: new Date() });

      expect(res.status).to.equal(403);
    });
    it('should return 400 if fromDate is not a valid date', async () => {
      const res = await request(ctx.app)
        .get('/stripe/report')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate: 'not-a-date', toDate: new Date() });

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /stripe/report/pdf', () => {
    let compileHtmlStub: sinon.SinonStub;

    afterEach(() => {
      if (compileHtmlStub) compileHtmlStub.restore();
    });

    it('should return 200 and a pdf for an admin', async () => {
      compileHtmlStub = sinon.stub(StripeSettlementReportPdfService.prototype, 'compileHtml' as any)
        .resolves(Buffer.from('PDF content'));

      const res = await request(ctx.app)
        .get('/stripe/report/pdf')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate: new Date(0), toDate: new Date(), fileType: 'PDF' });

      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.include('application/pdf');
    });
    it('should default to PDF when fileType is omitted', async () => {
      compileHtmlStub = sinon.stub(StripeSettlementReportPdfService.prototype, 'compileHtml' as any)
        .resolves(Buffer.from('PDF content'));

      const res = await request(ctx.app)
        .get('/stripe/report/pdf')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ fromDate: new Date(0), toDate: new Date() });

      expect(res.status).to.equal(200);
      expect(res.headers['content-disposition']).to.include('.PDF"');
    });
    it('should return 403 for a POS token, which has neither required permission', async () => {
      const res = await request(ctx.app)
        .get('/stripe/report/pdf')
        .set('Authorization', `Bearer ${ctx.posToken}`)
        .query({ fromDate: new Date(0), toDate: new Date(), fileType: 'PDF' });

      expect(res.status).to.equal(403);
    });
  });
});
