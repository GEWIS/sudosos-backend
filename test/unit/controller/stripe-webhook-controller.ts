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
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import Stripe from 'stripe';
import sinon from 'sinon';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import StripeWebhookController from '../../../src/controller/stripe-webhook-controller';
import StripeService, { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import { extractRawBody } from '../../../src/helpers/raw-body';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import { DepositSeeder, UserSeeder } from '../../seed';

describe('StripeWebhookController', async (): Promise<void> => {
  let shouldSkip: boolean;
  let originalName: string;

  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: StripeWebhookController,
    stripeDeposits: StripeDeposit[],
    stripe: Stripe;
    payload: any;
  };

  const stubs: sinon.SinonStub[] = [];

  function getSignatureHeader(payload: any) {
    return ctx.stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(payload),
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  }

  // eslint-disable-next-line func-names
  before(async function () {
    shouldSkip = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
      || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);
    if (shouldSkip) this.skip();

    originalName = process.env.NAME;
    const serviceName = 'sudosos-stripe-webhook-test-suite';
    process.env.NAME = serviceName;

    const connection = await Database.initialize();
    await truncateAllTables(connection);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    const roleManager = await new RoleManager().initialize();

    const users = await new UserSeeder().seed();
    const { stripeDeposits } = await new DepositSeeder().seed(users);

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
          id: stripeDeposits[0].stripePaymentIntent.stripeId,
          metadata: {
            service: serviceName,
            user_id: stripeDeposits[0].to.id,
          } as any,
        } as Stripe.PaymentIntent,
      },
      type: 'payment_intent.succeeded',
    };

    ctx = {
      connection,
      app,
      specification,
      controller,
      stripeDeposits,
      stripe,
      payload,
    };
  });

  after(async () => {
    if (shouldSkip) return;

    process.env.NAME = originalName;
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    if (shouldSkip) return;
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('GET /public', () => {
    it('should return 200 with public key', async () => {
      const oldPublicKey = process.env.STRIPE_PUBLIC_KEY;
      const oldReturnUrl = process.env.STRIPE_RETURN_URL;

      process.env.STRIPE_PUBLIC_KEY = 'STRIPE_Public_Key_Geef_Geld';
      process.env.STRIPE_RETURN_URL = 'https://wie.dit.leest.trekteenbak.nl';

      const res = await request(ctx.app)
        .get('/stripe/public');
      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('StripePublicKeyResponse', res.body, false, true);
      expect(validation.valid).to.equal(true);
      expect(res.body).to.deep.equal({
        publicKey: process.env.STRIPE_PUBLIC_KEY,
        returnUrl: process.env.STRIPE_RETURN_URL,
      });

      // Cleanup
      process.env.STRIPE_PUBLIC_KEY = oldPublicKey;
      process.env.STRIPE_RETURN_URL = oldReturnUrl;
    });
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
    it('should return 204 when sending correct request', async () => {
      const handleWebhookEventStub = sinon.stub(StripeService.prototype, 'handleWebhookEvent').resolves();
      stubs.push(handleWebhookEventStub);

      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .set('stripe-signature', getSignatureHeader(ctx.payload))
        .send(ctx.payload);
      expect(res.status).to.equal(204);

      // Race condition (by design), because the webhook event is and should be handled asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handleWebhookEventStub).to.have.been.calledOnce;
    });
    it('should return 400 when using unknown payment intent', async () => {
      const payload = {
        ...ctx.payload,
        data: {
          object: {
            ...ctx.payload.data.object,
            id: 'Yeeeee',
          },
        },
      };
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .set('stripe-signature', getSignatureHeader(payload))
        .send(payload);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('PaymentIntent with ID "Yeeeee" not found.');
    });
    it('should return 204 if not for SudoSOS service', async () => {
      const handleWebhookEventStub = sinon.stub(StripeService.prototype, 'handleWebhookEvent').resolves();
      stubs.push(handleWebhookEventStub);

      const payload = {
        ...ctx.payload,
        data: {
          object: {
            ...ctx.payload.data.object,
            metadata: {
              service: 'definitely-not-sudosos',
            },
          },
        },
      };
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .set('stripe-signature', getSignatureHeader(payload))
        .send(payload);
      expect(res.status).to.equal(204);

      // Race condition (by design), because the webhook event is and should be handled asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handleWebhookEventStub).to.not.have.been.called;
    });
    it('should return 204 if no service given', async () => {
      const handleWebhookEventStub = sinon.stub(StripeService.prototype, 'handleWebhookEvent').resolves();
      stubs.push(handleWebhookEventStub);

      const payload = {
        ...ctx.payload,
        data: {
          object: {
            ...ctx.payload.data.object,
            metadata: {},
          },
        },
      };
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .set('stripe-signature', getSignatureHeader(payload))
        .send(payload);
      expect(res.status).to.equal(204);

      // Race condition (by design), because the webhook event is and should be handled asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handleWebhookEventStub).to.not.have.been.called;
    });
    it('should return 204 if not listening for event', async () => {
      const handleWebhookEventStub = sinon.stub(StripeService.prototype, 'handleWebhookEvent').resolves();
      stubs.push(handleWebhookEventStub);

      const payload = {
        ...ctx.payload,
        type: 'nothing.just.testing',
      };
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .set('stripe-signature', getSignatureHeader(payload))
        .send(payload);
      expect(res.status).to.equal(204);

      // Race condition (by design), because the webhook event is and should be handled asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handleWebhookEventStub).to.not.have.been.called;
    });
  });
});
