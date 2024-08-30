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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import StripeController from '../../../src/controller/stripe-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import Database from '../../../src/database/database';
import { seedStripeDeposits } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { StripeRequest } from '../../../src/controller/request/stripe-request';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripePaymentIntentResponse } from '../../../src/controller/response/stripe-response';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { getToken, seedRoles } from '../../seed/rbac';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '../../../src/service/stripe-service';

describe('StripeController', async (): Promise<void> => {
  let shouldSkip: boolean;
  let originalName: string;

  let ctx: {
    connection: Connection,
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

  // eslint-disable-next-line func-names
  before(async function () {
    shouldSkip = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
      || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);
    if (shouldSkip) this.skip();

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
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });
    const localUser = await User.save({
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    });

    const { stripeDeposits } = await seedStripeDeposits([localUser, adminUser]);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const own = { own: new Set<string>(['*']), public: new Set<string>(['*']) };

    const roles = await seedRoles([{
      name: 'Admin',
      permissions: {
        StripeDeposit: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        StripeDeposit: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    }]);
    const roleManager = await new RoleManager().initialize();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken(await getToken(adminUser, roles), 'nonce admin');
    const userToken = await tokenHandler.signToken(await getToken(localUser, roles), 'nonce');

    const controller = new StripeController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/stripe', controller.getRouter());

    // Valid Stripe deposit initiation request
    const validDinero = DineroTransformer.Instance.from(1950);
    const validStripeRequest: StripeRequest = {
      amount: {
        amount: validDinero.getAmount(),
        precision: validDinero.getPrecision(),
        currency: validDinero.getCurrency(),
      },
    };

    // Too low Stripe deposit initiation request
    const minimumDinero = DineroTransformer.Instance.from(500);
    const minimumStripeRequest: StripeRequest = {
      amount: {
        amount: minimumDinero.getAmount(),
        precision: minimumDinero.getPrecision(),
        currency: minimumDinero.getCurrency(),
      },
    };

    // Too high Stripe deposit initiation request
    const maximumDinero = DineroTransformer.Instance.from(15600);
    const maximumStripeRequest: StripeRequest = {
      amount: {
        amount: maximumDinero.getAmount(),
        precision: maximumDinero.getPrecision(),
        currency: maximumDinero.getCurrency(),
      },
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

  after(async () => {
    if (shouldSkip) return;

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
      const stripeDeposit = await StripeDeposit.findOne({ where: { id: paymentIntent.id }, relations: ['to'] });
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
