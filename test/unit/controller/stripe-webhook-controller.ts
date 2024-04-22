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
import Stripe from 'stripe';
import sinon from 'sinon';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import StripeWebhookController from '../../../src/controller/stripe-webhook-controller';
import StripeService, { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import { extractRawBody } from '../../../src/helpers/raw-body';
import {truncateAllTables} from "../../setup";

describe('StripeWebhookController', async (): Promise<void> => {
  let shouldSkip: boolean;

  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: StripeWebhookController,
    stripe: Stripe;
    payload: object;
    signatureHeader: string;
  };

  const stubs: sinon.SinonStub[] = [];

  // eslint-disable-next-line func-names
  before(async function () {
    shouldSkip = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
      || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);
    if (shouldSkip) this.skip();

    const connection = await Database.initialize();
    await truncateAllTables(connection);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };

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

    const controller = new StripeWebhookController({ specification, roleManager });
    app.use(json({
      verify: extractRawBody,
    }));
    app.use('/stripe', controller.getRouter());

    const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });

    const payload = {
      data: {
        object: {
          id: 'abcde12345',
        } as Stripe.PaymentIntent,
      },
      type: 'UNKNOWN',
    };

    const signatureHeader = stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(payload),
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });

    ctx = {
      connection,
      app,
      specification,
      controller,
      stripe,
      payload,
      signatureHeader,
    };
  });

  after(async () => {
    if (shouldSkip) return;
    await Database.finish(ctx.connection);
  });

  afterEach(() => {
    if (shouldSkip) return;
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('POST /webhook', () => {
    it('should return 400 when sending no body', async () => {
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .send({});

      expect(res.status).to.equal(400);
    });
    it('should return 400 when sending no header', async () => {
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .send(ctx.payload);

      expect(res.status).to.equal(400);
    });
    it('should return 200 when sending correct request', async () => {
      const handleWebhookEventStub = sinon.stub(StripeService.prototype, 'handleWebhookEvent').resolves();
      stubs.push(handleWebhookEventStub);

      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .set('stripe-signature', ctx.signatureHeader)
        .send(ctx.payload);

      expect(handleWebhookEventStub).to.have.been.calledOnce;
      expect(res.status).to.equal(200);
    });
  });
});
