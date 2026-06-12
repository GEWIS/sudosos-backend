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
import User from '../../../src/entity/user/user';
import Database, { AppDataSource } from '../../../src/database/database';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import StripeService, { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import StripeWebhookService from '../../../src/service/stripe-webhook-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripePaymentIntentState } from '../../../src/entity/stripe/stripe-payment-intent-status';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import { DepositSeeder, UserSeeder } from '../../seed';

describe('StripeWebhookService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    users: User[],
    stripeDeposits: StripeDeposit[],
    stripeWebhookService: StripeWebhookService,
    dineroTransformer: DineroTransformer,
  };

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const { stripeDeposits } = await new DepositSeeder().seed(users);

    const stripeWebhookService = new StripeWebhookService();
    const dineroTransformer = DineroTransformer.Instance;

    ctx = {
      connection,
      users,
      stripeDeposits,
      stripeWebhookService,
      dineroTransformer,
    };
  });

  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('createNewPaymentIntentStatus', () => {
    const testStatusCreation = async (id: number, state: StripePaymentIntentState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === state))
        .to.be.false;

      const status = await AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state));
      expect(status.state).to.equal(state);

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length)
        .to.equal(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length + 1);
      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === state))
        .to.be.true;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    };
    it('should correctly create only one created status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 0))[0];
      await testStatusCreation(id, StripePaymentIntentState.CREATED);
    });
    it('should correctly create only one processing status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[0];
      await testStatusCreation(id, StripePaymentIntentState.PROCESSING);
    });
    it('should correctly create only one success status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 2 && !d.transfer))[0];
      let deposit = await StripeService.getStripeDeposit(id, { transfer: { to: true }, to: true });
      expect(deposit.transfer).to.be.null;

      await testStatusCreation(id, StripePaymentIntentState.SUCCEEDED);

      deposit = await StripeService.getStripeDeposit(id, { transfer: { to: true }, to: true });
      // Correct transfer should have been created
      expect(deposit.transfer).to.not.be.null;
      expect(ctx.dineroTransformer.to(deposit.transfer.amountInclVat))
        .to.equal(ctx.dineroTransformer.to(deposit.stripePaymentIntent.amount));
      expect(deposit.transfer.to.id).to.equal(deposit.to.id);
    });
    it('should correctly create only one failed status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[1];
      await testStatusCreation(id, StripePaymentIntentState.FAILED);
    });
    it('should not create duplicate created status', async () => {
      const { id } = ctx.stripeDeposits[0];
      const state = StripePaymentIntentState.CREATED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    });
    it('should not create "SUCCEEDED" state when "FAILED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.FAILED)))[0];
      const state = StripePaymentIntentState.SUCCEEDED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because FAILED already exists');
    });
    it('should not create "SUCCEEDED" state when "CANCELLED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.CANCELLED)))[0];
      const state = StripePaymentIntentState.SUCCEEDED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because CANCELLED already exists');
    });
    it('should not create "FAILED" state when "SUCCEEDED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.SUCCEEDED)))[0];
      const state = StripePaymentIntentState.FAILED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status FAILED, because SUCCEEDED already exists');
    });
    it('should not create "CANCELLED" state when "SUCCEEDED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.SUCCEEDED)))[0];
      const state = StripePaymentIntentState.CANCELLED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status CANCELLED, because SUCCEEDED already exists');
    });
    it('should not create "CANCELLED" state when "FAILED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.FAILED)))[0];
      const state = StripePaymentIntentState.CANCELLED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeWebhookService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status CANCELLED, because FAILED already exists');
    });
    it('should throw when paymentIntent does not exist', async () => {
      const id = ctx.stripeDeposits.length + 100;
      const promise = new StripeWebhookService().createNewPaymentIntentStatus(id, StripePaymentIntentState.CREATED);
      await expect(promise).to.eventually.be.rejectedWith(`PaymentIntent with id "${id}" not found.`);
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
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses.length === 1))[2];
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
