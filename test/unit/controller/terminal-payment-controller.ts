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

import { json } from 'body-parser';
import chai from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import sinon from 'sinon';
import Stripe from 'stripe';
import TokenHandler from '../../../src/authentication/token-handler';
import TerminalPaymentController from '../../../src/controller/terminal-payment-controller';
import { STRIPE_API_VERSION, StripePaymentTerminal } from '../../../src/service/stripe-service';
import TerminalPaymentService from '../../../src/service/terminal-payment-service';
import Database from '../../../src/database/database';
import TerminalPayment, { TerminalPaymentState } from '../../../src/entity/transactions/terminal/terminal-payment';
import TmpTransaction from '../../../src/entity/transactions/terminal/tmp-transaction';
import StripePaymentIntent from '../../../src/entity/stripe/stripe-payment-intent';
import User, { UserType } from '../../../src/entity/user/user';
import Config from '../../../src/config';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import { ensureProductionRoles, signTokenFor } from '../../helpers/user-factory';
import TerminalPaymentSeeder from '../../seed/ledger/terminal-payment-seeder';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';

const { expect, request } = chai;

const FAKE_PAYMENT_INTENT = 'fake_payment_intent_for_testing_do_not_use';
const FAKE_READER_ID = 'fake_reader_id_do_not_use';
const FAKE_UNAVAILABLE_READER_ID = 'fake_unavailable_reader_id_do_not_use';

// Fake Stripe terminal readers backing the stubbed `terminal.readers.list` call.
// One reader is idle (available) and one is mid-action (unavailable), so both the
// success and the "terminal unavailable" (HTTP 422) branches can be exercised.
const FAKE_READERS: Stripe.Terminal.Reader[] = [
  {
    id: FAKE_READER_ID,
    label: 'Available test terminal',
    last_seen_at: new Date().getTime() - 1000 * 60 * 15,
    action: null,
  } as any,
  {
    id: FAKE_READER_ID,
    label: 'Available test terminal',
    last_seen_at: new Date().getTime(),
    action: null,
  } as any,
  {
    id: FAKE_UNAVAILABLE_READER_ID,
    label: 'In-use test terminal',
    last_seen_at: new Date().getTime(),
    action: { status: 'in_progress' },
  } as any,
];

describe('TerminalPaymentController', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: TerminalPaymentController,
    adminUser: User,
    localUser: User,
    posUser: User,
    adminToken: String,
    token: String,
    posToken: String,
    terminalPayments: TerminalPayment[],
    posTerminalPayment: TerminalPayment,
    terminals: StripePaymentTerminal[],
    validTransactionRequest: TransactionRequest,
  };

  const stubs: sinon.SinonStub[] = [];
  let originalStripeKey: string | undefined;
  let paymentIntentsCreateStub: sinon.SinonStub;
  let paymentIntentsCancelStub: sinon.SinonStub;
  let readersProcessIntentStub: sinon.SinonStub;
  let readersCancelActionStub: sinon.SinonStub;
  let readersListStub: sinon.SinonStub;

  beforeAll(async () => {
    originalStripeKey = process.env.STRIPE_PRIVATE_KEY;
    process.env.STRIPE_PRIVATE_KEY = process.env.STRIPE_PRIVATE_KEY || 'sk_test_dummy';
    Config.reset();

    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      tosRequired: false,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      tosRequired: false,
    } as User;

    // The POS user owns the catalogue (acts as the seller) and is the account
    // that creates terminal payments on behalf of buyers.
    const posUser = {
      id: 3,
      firstName: 'Bar',
      type: UserType.POINT_OF_SALE,
      active: true,
      tosRequired: false,
    } as User;

    await User.save([adminUser, localUser, posUser]);

    // The TerminalPaymentSeeder seeds the full catalogue (categories, VAT
    // groups, products, containers, point of sale) and a set of transactions
    // internally when no points of sale or transactions are supplied, and
    // returns them so the requests below can be built against the same entities.
    const { terminalPayments, catalogue } = await new TerminalPaymentSeeder().seed([adminUser]);
    const { products, containers, pointOfSale } = catalogue!;

    // A terminal payment created by the POS user for the local user: the POS
    // user is the creator (createdBy) while the local user is the buyer (from).
    // POS users have the get-own permission, so this exercises the "own" relation.
    const { terminalPayment: posTerminalPayment } = await new TerminalPaymentSeeder()
      .init(posUser, pointOfSale.barRevision, localUser);

    const product = products.grimbergenRevision;
    const productPrice = product.priceInclVat.toObject();
    const validTransactionRequest: TransactionRequest = {
      from: localUser.id,
      createdBy: localUser.id,
      pointOfSale: {
        id: pointOfSale.bar.id,
        revision: pointOfSale.barRevision.revision,
      },
      subTransactions: [
        {
          to: adminUser.id,
          container: {
            id: containers.alcoholic.id,
            revision: containers.alcoholicRevision.revision,
          },
          subTransactionRows: [
            {
              product: {
                id: product.product.id,
                revision: product.revision,
              },
              amount: 1,
              totalPriceInclVat: productPrice,
            },
          ],
          totalPriceInclVat: productPrice,
        },
      ],
      totalPriceInclVat: productPrice,
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const app = express();
    const specification = await Swagger.initialize(app);

    await ensureProductionRoles();
    const roleManager = await new RoleManager().initialize();
    const adminToken = await signTokenFor(adminUser, tokenHandler, 'nonce admin');
    const token = await signTokenFor(localUser, tokenHandler);
    const posToken = await signTokenFor(posUser, tokenHandler);

    const controller = new TerminalPaymentController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/terminal-payments', controller.getRouter());

    // The terminals as the StripeService exposes them, derived from the fake
    // readers that back the stubbed `terminal.readers.list` call.
    const terminals: StripePaymentTerminal[] = FAKE_READERS.map((t) => ({
      id: t.id,
      name: t.label,
      lastSeenAt: new Date(t.last_seen_at),
      available: t.action?.status !== 'in_progress',
    }));

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      posUser,
      adminToken,
      token,
      posToken,
      terminalPayments,
      posTerminalPayment,
      terminals,
      validTransactionRequest,
    };
  });

  afterAll(async () => {
    process.env.STRIPE_PRIVATE_KEY = originalStripeKey;
    Config.reset();
    await finishTestDB(ctx.connection);
  });

  beforeEach(() => {
    // Stub the underlying Stripe API methods at the resource prototype level
    // so that no real HTTP calls are made by the StripeService. A throwaway
    // Stripe instance is used purely to reach the resource prototypes; the
    // stubs apply to every Stripe instance (including the one inside the
    // StripeService that TerminalPaymentService owns).
    const sampleStripe = new Stripe('sk_test_dummy', {
      apiVersion: STRIPE_API_VERSION,
    });
    paymentIntentsCreateStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.paymentIntents), 'create')
      .resolves({ id: FAKE_PAYMENT_INTENT, client_secret: 'cs_fake' } as any);
    paymentIntentsCancelStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.paymentIntents), 'cancel')
      .resolves({ id: FAKE_PAYMENT_INTENT, status: 'canceled' } as any);
    readersProcessIntentStub = sinon
      .stub(
        Object.getPrototypeOf(sampleStripe.terminal.readers),
        'processPaymentIntent',
      )
      .resolves({ id: FAKE_READER_ID } as any);
    readersCancelActionStub = sinon
      .stub(
        Object.getPrototypeOf(sampleStripe.terminal.readers),
        'cancelAction',
      )
      .resolves({ id: FAKE_READER_ID } as any);
    readersListStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.terminal.readers), 'list')
      .resolves({ data: FAKE_READERS } as any);
    stubs.push(paymentIntentsCreateStub, paymentIntentsCancelStub, readersProcessIntentStub, readersCancelActionStub, readersListStub);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('POST /terminal-payments', () => {
    it('should create a new terminal payment and return HTTP 200 if admin', async () => {
      const countBefore = await TerminalPayment.count();

      const res = await request(ctx.app)
        .post('/terminal-payments')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ transaction: ctx.validTransactionRequest });

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel('TerminalPaymentResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.state).to.equal(TerminalPaymentState.CREATED);

      // A new terminal payment (with its Stripe payment intent) was created
      expect(await TerminalPayment.count()).to.equal(countBefore + 1);
      expect(paymentIntentsCreateStub).to.be.calledOnce;

      // Cleanup: remove the created terminal payment and its dependent records,
      // so the system is back to its initial state.
      const created = await ctx.connection.getRepository(TerminalPayment).findOne({
        where: { id: res.body.id },
        relations: { temporaryTransaction: true, stripePaymentIntent: true },
      });
      await ctx.connection.getRepository(TerminalPayment).remove(created);
      await ctx.connection.getRepository(TmpTransaction).remove(created.temporaryTransaction);
      await ctx.connection.getRepository(StripePaymentIntent).remove(created.stripePaymentIntent);
      expect(await TerminalPayment.count()).to.equal(countBefore);
    });

    it('should return HTTP 400 if the request body is invalid', async () => {
      const countBefore = await TerminalPayment.count();

      const res = await request(ctx.app)
        .post('/terminal-payments')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ foo: 'bar' });

      expect(res.status).to.equal(400);
      // No terminal payment should have been created
      expect(await TerminalPayment.count()).to.equal(countBefore);
    });

    it('should return HTTP 400 if the terminal payment request cannot be validated', async () => {
      const countBefore = await TerminalPayment.count();
      // Structurally valid request, but the transaction references a non-existing user
      const invalidRequest = {
        transaction: {
          ...ctx.validTransactionRequest,
          createdBy: 100000,
        },
      };

      const res = await request(ctx.app)
        .post('/terminal-payments')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidRequest);

      expect(res.status).to.equal(400);
      expect(res.text).to.equal('Could not validate terminalPayment.');
      expect(await TerminalPayment.count()).to.equal(countBefore);
    });

    it('should return HTTP 400 if transaction fromUser is of wrong type', async () => {
      const allowedTypes = [UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.POINT_OF_SALE];
      const allTypes: UserType[] = Object.keys(UserType) as UserType[];
      const typesToTest = allTypes.filter((t) => !allowedTypes.includes(t));
      expect(typesToTest.length).to.be.greaterThan(0);

      const countBefore = await TerminalPayment.count();

      // Test for each user type that is not allowed to make a terminal payment
      for (const type of typesToTest) {
        let u = {
          firstName: `userType-${type}`,
          type,
          active: true,
          tosRequired: false,
        } as User;
        u = await User.save(u);

        const req = { transaction: { ...ctx.validTransactionRequest } };
        req.transaction.from = u.id;

        const res = await request(ctx.app)
          .post('/terminal-payments')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(req);

        expect(res.status).to.equal(400);
        // Already blocked by transaction validator.
        if (type === UserType.ORGAN) {
          expect(res.text).to.equal('Could not validate terminalPayment.');
        } else {
          expect(res.text).to.equal(`Could not create terminalPayment for user "${u.firstName} (SudoSOS ID: ${u.id})", because their account type is "${u.type}"`);
        }
        expect(await TerminalPayment.count()).to.equal(countBefore);

        await User.delete(u.id);
      }
    });

    it('should return HTTP 403 if the user is not allowed to create a terminal payment', async () => {
      const countBefore = await TerminalPayment.count();

      const res = await request(ctx.app)
        .post('/terminal-payments')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ transaction: ctx.validTransactionRequest });

      expect(res.status).to.equal(403);
      expect(await TerminalPayment.count()).to.equal(countBefore);
    });

    it('should return HTTP 500 if the terminal payment could not be created', async () => {
      const countBefore = await TerminalPayment.count();
      const createStub = sinon
        .stub(TerminalPaymentService.prototype, 'createTerminalPayment')
        .rejects(new Error('Something went wrong'));
      stubs.push(createStub);

      const res = await request(ctx.app)
        .post('/terminal-payments')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ transaction: ctx.validTransactionRequest });

      expect(res.status).to.equal(500);
      expect(res.text).to.equal('Internal server error.');
      // Transaction should have rolled back, leaving no new terminal payment
      expect(await TerminalPayment.count()).to.equal(countBefore);
    });
  });

  describe('GET /terminal-payments/:id', () => {
    it('should return the terminal payment with the given id and HTTP 200', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment, 'Precondition failed: no CREATED terminal payment seeded').to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel('TerminalPaymentResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.id).to.equal(terminalPayment!.id);
      expect(res.body.state).to.equal(TerminalPaymentState.CREATED);
    });

    it('should return HTTP 200 if the user views their own terminal payment', async () => {
      // The POS user owns this terminal payment and has the get-own permission.
      const res = await request(ctx.app)
        .get(`/terminal-payments/${ctx.posTerminalPayment.id}`)
        .set('Authorization', `Bearer ${ctx.posToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel('TerminalPaymentResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.id).to.equal(ctx.posTerminalPayment.id);
    });

    it('should return HTTP 404 if the terminal payment does not exist', async () => {
      const id = ctx.terminalPayments.length + 1000;

      const res = await request(ctx.app)
        .get(`/terminal-payments/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.text).to.equal(`Terminal Payment with ID "${id}" not found.`);
    });

    it('should return HTTP 403 if the user is not allowed to view the terminal payment', async () => {
      // The local user is not the owner of any terminal payment and lacks the
      // permission to view terminal payments belonging to others.
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
    });

    it('should return HTTP 500 if the terminal payment could not be retrieved', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const responseStub = sinon
        .stub(TerminalPaymentService, 'asTerminalPaymentResponse')
        .rejects(new Error('Something went wrong'));
      stubs.push(responseStub);

      const res = await request(ctx.app)
        .get(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(500);
      expect(res.text).to.equal('Internal server error.');
    });
  });

  describe('POST /terminal-payments/:id/process', () => {
    it('should start the terminal payment and return HTTP 204 if admin', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ stripeTerminalId: FAKE_READER_ID });

      expect(res.status).to.equal(204);
      // The payment intent was forwarded to the requested Stripe terminal
      expect(readersProcessIntentStub).to.be.calledOnceWith(FAKE_READER_ID, {
        payment_intent: terminalPayment!.stripePaymentIntent.stripeId,
      });
      // Starting the payment changes the state to PROCESSING
      expect((await new TerminalPaymentService().getTerminalPayment(terminalPayment!.id))!.getState())
        .to.equal(TerminalPaymentState.PROCESSING);

      // Cleanup: revert to CREATED so the other tests that rely on this shared
      // seeded payment being CREATED (in particular the cancel test, whose stub
      // set does not include `terminal.readers.cancelAction`) are not affected.
      await ctx.connection.getRepository(TerminalPayment)
        .update(terminalPayment!.id, { processedByTerminal: null });
    });

    it('should return HTTP 400 if the request body is invalid', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});

      expect(res.status).to.equal(400);
      expect(readersProcessIntentStub).to.not.be.called;
    });

    it('should return HTTP 404 if the terminal payment does not exist', async () => {
      const id = ctx.terminalPayments.length + 1000;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ stripeTerminalId: FAKE_READER_ID });

      expect(res.status).to.equal(404);
      expect(res.text).to.equal(`Terminal Payment with ID "${id}" not found.`);
      expect(readersProcessIntentStub).to.not.be.called;
    });

    it('should return HTTP 404 if the Stripe terminal does not exist', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ stripeTerminalId: 'non-existing-terminal' });

      expect(res.status).to.equal(404);
      expect(res.text).to.equal('Stripe terminal with ID "non-existing-terminal" not found.');
      expect(readersProcessIntentStub).to.not.be.called;
    });

    it('should return HTTP 422 if the TerminalPayment is already paid', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PAID,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ stripeTerminalId: FAKE_UNAVAILABLE_READER_ID });

      expect(res.status).to.equal(422);
      expect(res.text).to.equal('TerminalPayment already paid.');
      expect(readersProcessIntentStub).to.not.be.called;
    });

    it('should return HTTP 422 if the Stripe terminal is unavailable', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ stripeTerminalId: FAKE_UNAVAILABLE_READER_ID });

      expect(res.status).to.equal(422);
      expect(res.text).to.equal('Terminal unavailable (is it in use?)');
      expect(readersProcessIntentStub).to.not.be.called;
    });

    it('should return HTTP 403 if the user is not allowed to start the terminal payment', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ stripeTerminalId: FAKE_READER_ID });

      expect(res.status).to.equal(403);
      expect(readersProcessIntentStub).to.not.be.called;
    });

    it('should return HTTP 500 if the terminal payment could not be started', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const startStub = sinon
        .stub(TerminalPaymentService.prototype, 'startTerminalPayment')
        .rejects(new Error('Something went wrong'));
      stubs.push(startStub);

      const res = await request(ctx.app)
        .post(`/terminal-payments/${terminalPayment!.id}/process`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ stripeTerminalId: FAKE_READER_ID });

      expect(res.status).to.equal(500);
      expect(res.text).to.equal('Internal server error.');
    });
  });

  describe('DELETE /terminal-payments/:id', () => {
    it('should return HTTP 404 if the terminal payment does not exist', async () => {
      const id = ctx.terminalPayments.length + 1000;

      const res = await request(ctx.app)
        .delete(`/terminal-payments/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.text).to.equal(`Terminal Payment with ID "${id}" not found.`);
      expect(paymentIntentsCancelStub).to.not.be.called;
    });

    it('should return HTTP 422 if the terminal payment is not created/processing', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PAID,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .delete(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(422);
      expect(res.text).to.equal(
        `Terminal Payment cannot be cancelled, because it has state "${TerminalPaymentState.PAID}"`,
      );
      expect(paymentIntentsCancelStub).to.not.be.called;
    });

    it('should return HTTP 403 if the user is not allowed to cancel the terminal payment', async () => {
      // The local user neither owns this terminal payment nor has the cancel
      // permission for terminal payments belonging to others.
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const res = await request(ctx.app)
        .delete(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(paymentIntentsCancelStub).to.not.be.called;
    });

    it('should return HTTP 500 if the terminal payment could not be cancelled', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment).to.not.be.undefined;

      const cancelStub = sinon
        .stub(TerminalPaymentService.prototype, 'cancelTerminalPayment')
        .rejects(new Error('Something went wrong'));
      stubs.push(cancelStub);

      const res = await request(ctx.app)
        .delete(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(500);
      expect(res.text).to.equal('Internal server error.');
    });

    // Destructive tests: run last so the cancelled state does not affect the
    // other cases that rely on a CREATED terminal payment being present.
    it('should cancel the terminal payment and return HTTP 200 if admin', async () => {
      const terminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(terminalPayment, 'Precondition failed: no CREATED terminal payment seeded').to.not.be.undefined;

      const res = await request(ctx.app)
        .delete(`/terminal-payments/${terminalPayment!.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel('TerminalPaymentResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.id).to.equal(terminalPayment!.id);
      expect(res.body.state).to.equal(TerminalPaymentState.CANCELLED);

      // The Stripe payment intent was cancelled
      expect(paymentIntentsCancelStub).to.be.calledOnceWith(
        terminalPayment!.stripePaymentIntent.stripeId,
      );

      // The change is persisted: the terminal payment is now cancelled
      const dbTerminalPayment = await new TerminalPaymentService().getTerminalPayment(terminalPayment!.id);
      expect(dbTerminalPayment!.getState()).to.equal(TerminalPaymentState.CANCELLED);
    });

    it('should return HTTP 200 if the POS user cancels their own terminal payment', async () => {
      // The POS user is the creator of this terminal payment and has the
      // cancel-own permission on TerminalPayment.
      const res = await request(ctx.app)
        .delete(`/terminal-payments/${ctx.posTerminalPayment.id}`)
        .set('Authorization', `Bearer ${ctx.posToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel('TerminalPaymentResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
      expect(res.body.id).to.equal(ctx.posTerminalPayment.id);
      expect(res.body.state).to.equal(TerminalPaymentState.CANCELLED);
      expect(paymentIntentsCancelStub).to.be.calledOnceWith(
        ctx.posTerminalPayment.stripePaymentIntent.stripeId,
      );

      const dbTerminalPayment = await new TerminalPaymentService().getTerminalPayment(ctx.posTerminalPayment.id);
      expect(dbTerminalPayment!.getState()).to.equal(TerminalPaymentState.CANCELLED);
    });
  });
});
