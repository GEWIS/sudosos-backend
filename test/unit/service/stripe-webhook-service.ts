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
import { expect } from 'chai';
import sinon from 'sinon';
import log4js from 'log4js';
import Stripe from 'stripe';
import User, { UserType } from '../../../src/entity/user/user';
import Database, { AppDataSource } from '../../../src/database/database';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import StripeService, { STRIPE_API_VERSION, StripeFactory } from '../../../src/service/stripe-service';
import StripeWebhookService from '../../../src/service/stripe-webhook-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import StripePaymentIntentStatus, { StripePaymentIntentState } from '../../../src/entity/stripe/stripe-payment-intent-status';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import { DepositSeeder, TerminalPaymentSeeder, UserSeeder } from '../../seed';
import TerminalPayment, { TerminalPaymentState } from '../../../src/entity/transactions/terminal/terminal-payment';
import TerminalPaymentService from '../../../src/service/terminal-payment-service';
import StripePaymentIntent from '../../../src/entity/stripe/stripe-payment-intent';
import Sinon from 'sinon';
import PaymentRequest from '../../../src/entity/payment-request/payment-request';
import { PaymentRequestStatus } from '../../../src/entity/payment-request/payment-request-status';
import PaymentRequestAttempt from '../../../src/entity/payment-request/payment-request-attempt';
import PaymentRequestService from '../../../src/service/payment-request-service';
import PaymentRequestCheckoutService from '../../../src/service/payment-request-checkout-service';
import Transfer from '../../../src/entity/transactions/transfer';

const shouldSkipStripe = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
  || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);

describe.skipIf(shouldSkipStripe)('StripeWebhookService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    users: User[],
    stripeDeposits: StripeDeposit[],
    terminalPayments: TerminalPayment[],
    stripeWebhookService: StripeWebhookService,
    dineroTransformer: DineroTransformer,
  };

  let stubs: Sinon.SinonStub[] = [];

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const { stripeDeposits } = await new DepositSeeder().seed(users);
    const { terminalPayments } = await new TerminalPaymentSeeder().seed(users);

    const stripeWebhookService = new StripeWebhookService();
    const dineroTransformer = DineroTransformer.Instance;

    ctx = {
      connection,
      users,
      stripeDeposits,
      terminalPayments,
      stripeWebhookService,
      dineroTransformer,
    };
  });

  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('createNewPaymentIntentStatus', () => {
    const testStatusCreation = async (paymentIntentId: number, state: StripePaymentIntentState) => {
      const beforePaymentIntent = await ctx.connection.manager.getRepository(StripePaymentIntent).findOne({
        where: { id: paymentIntentId },
        relations: { paymentIntentStatuses: true },
      });

      // Precondition: state does not yet exist
      expect(beforePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === state))
        .to.be.false;

      const status = await AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(paymentIntentId, state));
      expect(status.state).to.equal(state);

      const afterPaymentIntent = await ctx.connection.manager.getRepository(StripePaymentIntent).findOne({
        where: { id: paymentIntentId },
        relations: { paymentIntentStatuses: true },
      });
      expect(afterPaymentIntent.paymentIntentStatuses.length)
        .to.equal(beforePaymentIntent.paymentIntentStatuses.length + 1);
      expect(afterPaymentIntent.paymentIntentStatuses
        .some((s) => s.state === state))
        .to.be.true;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(paymentIntentId, state)))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    };
    it('should correctly create only one created status', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 0))[0];
      await testStatusCreation(deposit.stripePaymentIntent.id, StripePaymentIntentState.CREATED);
    });
    it('should correctly create only one processing status', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[0];
      await testStatusCreation(deposit.stripePaymentIntent.id, StripePaymentIntentState.PROCESSING);
    });
    it('should correctly create only one success status for deposit', async () => {
      const ctxDeposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 2 && !d.transfer))[0];
      let deposit = await StripeService.getStripeDeposit(ctxDeposit.id, { transfer: { to: true }, to: true });
      expect(deposit.transfer).to.be.null;

      await testStatusCreation(ctxDeposit.stripePaymentIntent.id, StripePaymentIntentState.SUCCEEDED);

      deposit = await StripeService.getStripeDeposit(ctxDeposit.id, { transfer: { to: true }, to: true });
      // Correct transfer should have been created
      expect(deposit.transfer).to.not.be.null;
      expect(ctx.dineroTransformer.to(deposit.transfer.amountInclVat))
        .to.equal(ctx.dineroTransformer.to(deposit.stripePaymentIntent.amount));
      expect(deposit.transfer.to.id).to.equal(deposit.to.id);
    });
    it('should correctly create only one success status for terminal payment', async () => {
      const { id } = (ctx.terminalPayments.filter((t) => t.getState() === TerminalPaymentState.PROCESSING))[0];
      let terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      expect(terminalPayment).to.not.be.null;
      expect(terminalPayment.getState()).to.equal(TerminalPaymentState.PROCESSING);

      await testStatusCreation(terminalPayment.stripePaymentIntent.id, StripePaymentIntentState.SUCCEEDED);

      terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      expect(terminalPayment.getState()).to.equal(TerminalPaymentState.PAID);
    });
    it('should correctly create only one failed status', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[1];
      await testStatusCreation(deposit.stripePaymentIntent.id, StripePaymentIntentState.FAILED);
    });
    it('should correctly create only one cancelled status', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[2];
      await testStatusCreation(deposit.stripePaymentIntent.id, StripePaymentIntentState.CANCELLED);
    });
    it('should correctly create only one cancelled status for terminal payment and mark cancelled', async () => {
      const { id } = (ctx.terminalPayments.filter((t) => t.getState() === TerminalPaymentState.CREATED))[1];
      let terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      expect(terminalPayment).to.not.be.null;
      expect(terminalPayment.getState()).to.equal(TerminalPaymentState.CREATED);

      await testStatusCreation(terminalPayment.stripePaymentIntent.id, StripePaymentIntentState.CANCELLED);

      terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      expect(terminalPayment.getState()).to.equal(TerminalPaymentState.CANCELLED);
    });
    it('should correctly create only one cancelled status for terminal payment and not propagate', async () => {
      const { id } = (ctx.terminalPayments.filter((t) => t.getState() === TerminalPaymentState.CANCELLED))[0];
      let terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      expect(terminalPayment).to.not.be.null;
      expect(terminalPayment.getState()).to.equal(TerminalPaymentState.CANCELLED);
      expect(terminalPayment.stripePaymentIntent.paymentIntentStatuses.length).to.equal(2);

      // Remove status for this test
      const stateEntity = terminalPayment.stripePaymentIntent.paymentIntentStatuses.find((s) => s.state !== StripePaymentIntentState.CREATED);
      expect(stateEntity).to.not.be.undefined;
      await StripePaymentIntentStatus.remove(stateEntity);

      // The terminal payment is already CANCELLED, so the cancellation must not
      // be propagated back to Stripe.
      const cancelPaymentIntentStub = sinon.stub(StripeService.prototype, 'cancelPaymentIntent');
      stubs.push(cancelPaymentIntentStub);

      await testStatusCreation(terminalPayment.stripePaymentIntent.id, StripePaymentIntentState.CANCELLED);

      terminalPayment = await new TerminalPaymentService().getTerminalPayment(id);
      expect(terminalPayment.getState()).to.equal(TerminalPaymentState.CANCELLED);
      expect(terminalPayment.stripePaymentIntent.paymentIntentStatuses.length).to.equal(2);
      expect(cancelPaymentIntentStub).to.not.have.been.called;
    });
    it('should not create duplicate created status', async () => {
      const deposit = ctx.stripeDeposits[0];
      const state = StripePaymentIntentState.CREATED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(deposit.stripePaymentIntent.id, state)))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    });
    it('should not create "SUCCEEDED" state when "FAILED" already exists', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.FAILED)))[0];
      const state = StripePaymentIntentState.SUCCEEDED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(deposit.stripePaymentIntent.id, state)))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because FAILED already exists');
    });
    it('should not create "SUCCEEDED" state when "CANCELLED" already exists', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.CANCELLED)))[0];
      const state = StripePaymentIntentState.SUCCEEDED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(deposit.stripePaymentIntent.id, state)))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because CANCELLED already exists');
    });
    it('should not create "FAILED" state when "SUCCEEDED" already exists', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.SUCCEEDED)))[0];
      const state = StripePaymentIntentState.FAILED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(deposit.stripePaymentIntent.id, state)))
        .to.eventually.be.rejectedWith('Cannot create status FAILED, because SUCCEEDED already exists');
    });
    it('should not create "CANCELLED" state when "SUCCEEDED" already exists', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.SUCCEEDED)))[0];
      const state = StripePaymentIntentState.CANCELLED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(deposit.stripePaymentIntent.id, state)))
        .to.eventually.be.rejectedWith('Cannot create status CANCELLED, because SUCCEEDED already exists');
    });
    it('should not create "CANCELLED" state when "FAILED" already exists', async () => {
      const deposit = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.FAILED)))[0];
      const state = StripePaymentIntentState.CANCELLED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(deposit.stripePaymentIntent.id, state)))
        .to.eventually.be.rejectedWith('Cannot create status CANCELLED, because FAILED already exists');
    });
    it('should throw when paymentIntent does not exist', async () => {
      const id = ctx.stripeDeposits.length + ctx.terminalPayments.length + 100;
      const promise = new StripeWebhookService().createNewPaymentIntentStatus(id, StripePaymentIntentState.CREATED);
      await expect(promise).to.eventually.be.rejectedWith(`PaymentIntent with id "${id}" not found.`);
    });
    it('should create a Transfer and mark the PaymentRequest PAID when its payment intent succeeds, even though no StripeDeposit was ever created for it', async () => {
      const admin = await User.save({ firstName: 'PR-Admin', type: UserType.LOCAL_ADMIN, active: true });
      const member = await User.save({ firstName: 'PR-Member', type: UserType.MEMBER, active: true });

      const paymentIntentsCreateStub = sinon.stub().resolves({
        id: `pi_${Math.random().toString(36).slice(2)}`,
        client_secret: 'secret_test',
      });
      const stripeFactoryStub = sinon.stub(StripeFactory, 'create').returns({
        paymentIntents: { create: paymentIntentsCreateStub },
      } as any);
      stubs.push(stripeFactoryStub);

      const request = await new PaymentRequestService().createPaymentRequest({
        for: member,
        createdBy: admin,
        amount: DineroTransformer.Instance.from(1500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const { intentId } = await new PaymentRequestCheckoutService().startPayment(request);
      const attempt = await PaymentRequestAttempt.findOne({
        where: { paymentRequestUuid: request.id },
        relations: { paymentIntent: true },
      });

      // Precondition: this intent settles a PaymentRequest, not a StripeDeposit.
      const intentBefore = await StripePaymentIntent.findOne({
        where: { id: attempt.paymentIntent.id },
        relations: { deposit: true },
      });
      expect(intentBefore.deposit).to.be.null;

      await new StripeWebhookService().createNewPaymentIntentStatus(attempt.paymentIntent.id, StripePaymentIntentState.SUCCEEDED);

      const reloadedRequest = await PaymentRequest.findOne({ where: { id: request.id } });
      expect(reloadedRequest.status).to.equal(PaymentRequestStatus.PAID);

      const transfer = await Transfer.findOne({ where: { description: intentId }, relations: { to: true } });
      expect(transfer, 'expected a credit Transfer to have been created for the paid PaymentRequest').to.not.be.null;
      expect(transfer!.to.id).to.equal(member.id);
      expect(ctx.dineroTransformer.to(transfer!.amountInclVat)).to.equal(1500);
    });
  });

  describe('handleWebhookEvent', async () => {
    const testHandleWebhookEvent = async (id: number, state: StripePaymentIntentState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses.some((s) => s.state === state)).to.be.false;

      let type;
      switch (state) {
        case StripePaymentIntentState.CREATED:
          type = 'payment_intent.created';
          break;
        case StripePaymentIntentState.PROCESSING:
          type = 'payment_intent.processing';
          break;
        case StripePaymentIntentState.SUCCEEDED:
          type = 'payment_intent.succeeded';
          break;
        case StripePaymentIntentState.FAILED:
          type = 'payment_intent.payment_failed';
          break;
        case StripePaymentIntentState.CANCELLED:
          type = 'payment_intent.canceled';
          break;
        default:
          type = 'UNKNOWN';
          break;
      }

      const event = {
        type,
        api_version: STRIPE_API_VERSION,
        data: {
          object: {
            id: beforeStripeDeposit.stripePaymentIntent.stripeId,
          } as any,
        },
      } as Stripe.Event;

      await expect(ctx.stripeWebhookService.handleWebhookEvent(event)).to.eventually.be.fulfilled;

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length)
        .to.equal(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length + 1);
      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses.some((s) => s.state === state)).to.be.true;
    };

    it('should correctly handle payment_intent.created', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 0))[1];
      await testHandleWebhookEvent(id, StripePaymentIntentState.CREATED);
    });
    it('should correctly handle payment_intent.processing', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[1];
      await testHandleWebhookEvent(id, StripePaymentIntentState.PROCESSING);
    });
    it('should correctly handle payment_intent.succeeded', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 2))[2];
      await testHandleWebhookEvent(id, StripePaymentIntentState.SUCCEEDED);
    });
    it('should correctly handle payment_intent.payment_failed', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 2))[3];
      await testHandleWebhookEvent(id, StripePaymentIntentState.FAILED);
    });
    it('should correctly handle payment_intent.payment_cancelled', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[3];
      await testHandleWebhookEvent(id, StripePaymentIntentState.CANCELLED);
    });
    it('should correctly do nothing when type is not listed', async () => {
      const { id } = ctx.stripeDeposits[ctx.stripeDeposits.length - 1];
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      const event = {
        type: 'unknown_stripe_event_to_test_stuff',
        api_version: STRIPE_API_VERSION,
        data: {
          object: {
            id: beforeStripeDeposit.stripePaymentIntent.stripeId,
          } as any,
        },
      } as unknown as Stripe.Event;

      await expect(ctx.stripeWebhookService.handleWebhookEvent(event)).to.be.eventually.fulfilled;
      const afterStripeDeposit = await StripeService.getStripeDeposit(id);

      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length)
        .to.equal(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length);
      expect(afterStripeDeposit.updatedAt.getTime())
        .to.equal(beforeStripeDeposit.updatedAt.getTime());
    });
    it('should log an error when paymentIntent does not exist', async () => {
      const id = 'abc-non-existent-id-fake';
      const event = {
        type: 'payment_intent.created',
        api_version: STRIPE_API_VERSION,
        data: {
          object: {
            id,
          } as any,
        },
      } as Stripe.Event;

      // The service swallows the error and only logs it, so stub the logger to intercept it.
      // log4js.getLogger() returns a fresh Logger wrapper each call, so we stub the shared
      // Logger prototype to also affect the instance the service created in beforeAll.
      const loggerProto = Object.getPrototypeOf(log4js.getLogger('StripeController'));
      const errorStub = sinon.stub(loggerProto, 'error');
      try {
        await expect(ctx.stripeWebhookService.handleWebhookEvent(event)).to.eventually.be.fulfilled;

        expect(errorStub).to.have.been.called;
        const loggedError = errorStub.getCalls()
          .flatMap((call) => call.args)
          .find((arg) => arg instanceof Error
            && arg.message === `Could not find payment intent with ID "${id}"`);
        expect(loggedError, 'expected the missing-payment-intent error to be logged').to.exist;
      } finally {
        errorStub.restore();
      }
    });
  });
});
