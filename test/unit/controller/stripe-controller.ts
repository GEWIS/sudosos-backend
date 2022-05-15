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
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import StripeController from '../../../src/controller/stripe-controller';
import User, { UserType } from '../../../src/entity/user/user';
import StripeDeposit from '../../../src/entity/deposit/stripe-deposit';
import Database from '../../../src/database/database';
import { seedStripeDeposits } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { StripeRequest } from '../../../src/controller/request/stripe-request';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripePaymentIntentResponse } from '../../../src/controller/response/stripe-response';

describe('StripeController', async (): Promise<void> => {
  let shouldSkip: boolean;

  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: StripeController,
    localUser: User,
    adminUser: User,
    userToken: string,
    adminToken: string,
    stripeDeposits: StripeDeposit[],
    validStripeRequest: StripeRequest;
  };

  // eslint-disable-next-line func-names
  before(async function () {
    shouldSkip = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
      || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);
    if (shouldSkip) this.skip();

    const connection = await Database.initialize();

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.MEMBER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    const stripeDeposits = await seedStripeDeposits([localUser, adminUser]);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const userToken = await tokenHandler.signToken({ user: localUser, roles: ['User'], lesser: false }, 'nonce');

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const own = { own: new Set<string>(['*']), public: new Set<string>(['*']) };

    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        StripeDeposit: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });
    roleManager.registerRole({
      name: 'User',
      permissions: {
        StripeDeposit: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new StripeController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/stripe', controller.getRouter());

    const dinero = DineroTransformer.Instance.from(3900);
    const validStripeRequest: StripeRequest = {
      amount: {
        amount: dinero.getAmount(),
        precision: dinero.getPrecision(),
        currency: dinero.getCurrency(),
      },
    };

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      userToken,
      stripeDeposits,
      validStripeRequest,
    };
  });

  after(async () => {
    if (shouldSkip) return;
    await ctx.connection.close();
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
      const stripeDeposit = await StripeDeposit.findOne(paymentIntent.id, { relations: ['to'] });
      expect(ctx.localUser.id).to.equal(stripeDeposit.to.id);
    });
    it('should return an HTTP 401 if no Bearer token provided', async () => {
      const res = await request(ctx.app)
        .post('/stripe/deposit')
        .send(ctx.validStripeRequest);

      expect(res.status).to.equal(401);
    });
  });
});
