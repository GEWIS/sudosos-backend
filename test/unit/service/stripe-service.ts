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
import { expect } from 'chai';
import Stripe from 'stripe';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { seedStripeDeposits, seedUsers } from '../../seed';
import StripeDeposit from '../../../src/entity/deposit/stripe-deposit';
import StripeService, { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripeDepositState } from '../../../src/entity/deposit/stripe-deposit-status';
import wrapInManager from '../../../src/helpers/database';
import BalanceResponse from '../../../src/controller/response/balance-response';
import { StripeRequest } from '../../../src/controller/request/stripe-request';

describe('StripeService', async (): Promise<void> => {
  let shouldSkip: boolean;

  let ctx: {
    connection: Connection,
    users: User[],
    stripeDeposits: StripeDeposit[],
    stripeService: StripeService,
    dineroTransformer: DineroTransformer,
  };

  // eslint-disable-next-line func-names
  before(async function () {
    shouldSkip = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
      || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);
    if (shouldSkip) this.skip();

    const connection = await Database.initialize();

    const users = await seedUsers();
    const { stripeDeposits } = await seedStripeDeposits(users);

    const stripeService = new StripeService();
    const dineroTransformer = DineroTransformer.Instance;

    ctx = {
      connection,
      users,
      stripeDeposits,
      stripeService,
      dineroTransformer,
    };
  });

  after(async () => {
    if (shouldSkip) return;
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('getProcessingStripeDepositsFromUser', () => {
    it('should return the correct deposits', async () => {
      const processingDeposits = ctx.stripeDeposits.filter((d) => {
        return d.depositStatus.length === 2 && d.depositStatus.some((s) => s.state === StripeDepositState.PROCESSING);
      });

      const user = processingDeposits[0].to;
      const depositsFromUser = processingDeposits.filter((d) => d.to.id === user.id);

      const deposits = await StripeService.getProcessingStripeDepositsFromUser(user.id);
      expect(depositsFromUser.length).to.equal(deposits.length);
      deposits.forEach((d) => {
        expect(d.to.id).to.equal(user.id);
        const states = d.depositStatus
          .map((s) => s.state);
        expect(states[states.length - 1]).to.equal(StripeDepositState.PROCESSING);
      });
    });
  });

  describe('createStripePaymentIntent', () => {
    it('should correctly create a payment intent', async () => {
      const countBefore = await StripeDeposit.count();

      const intent = await ctx.stripeService.createStripePaymentIntent(
        ctx.users[0], ctx.dineroTransformer.from(1500),
      );

      expect(intent).to.not.be.undefined;

      const countAfter = await StripeDeposit.count();
      const stripeDeposit = await StripeService.getStripeDeposit(intent.id);

      expect(stripeDeposit).to.not.be.undefined;
      expect(stripeDeposit.id).to.equal(intent.id);
      expect(countAfter).to.equal(countBefore + 1);

      expect(intent.stripeId).to.equal(stripeDeposit.stripeId);
      expect(stripeDeposit.depositStatus.length).to.equal(0);
    });
  });

  describe('createNewDepositStatus', () => {
    const testStatusCreation = async (id: number, state: StripeDepositState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.false;

      const status = await wrapInManager(StripeService.createNewDepositStatus)(id, state);
      expect(status.state).to.equal(state);

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.depositStatus.length)
        .to.equal(beforeStripeDeposit.depositStatus.length + 1);
      expect(afterStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.true;

      await expect(wrapInManager(StripeService.createNewDepositStatus)(id, state))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    };
    it('should correctly create only one created status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 0))[0];
      await testStatusCreation(id, StripeDepositState.CREATED);
    });
    it('should correctly create only one processing status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 1))[0];
      await testStatusCreation(id, StripeDepositState.PROCESSING);
    });
    it('should correctly create only one success status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 2))[0];
      let deposit = await StripeService.getStripeDeposit(id);
      expect(deposit.transfer).to.be.undefined;

      await testStatusCreation(id, StripeDepositState.SUCCEEDED);

      deposit = await StripeService.getStripeDeposit(id, ['transfer', 'transfer.to', 'to']);
      expect(ctx.dineroTransformer.to(deposit.transfer.amount))
        .to.equal(ctx.dineroTransformer.to(deposit.amount));
      expect(deposit.transfer.to.id).to.equal(deposit.to.id);
    });
    it('should correctly create only one failed status', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 2))[1];
      await testStatusCreation(id, StripeDepositState.FAILED);
    });
    it('should not create duplicate created status', async () => {
      const { id } = ctx.stripeDeposits[0];
      const state = StripeDepositState.CREATED;

      await expect(wrapInManager(StripeService.createNewDepositStatus)(id, state))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    });
    it('should not create "SUCCEEDED" state when "FAILED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus
        .some((s) => s.state === StripeDepositState.FAILED)))[0];
      const state = StripeDepositState.SUCCEEDED;

      await expect(wrapInManager(StripeService.createNewDepositStatus)(id, state))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because FAILED already exists');
    });
    it('should not create "FAILED" state when "SUCCEEDED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus
        .some((s) => s.state === StripeDepositState.SUCCEEDED)))[0];
      const state = StripeDepositState.FAILED;

      await expect(wrapInManager(StripeService.createNewDepositStatus)(id, state))
        .to.eventually.be.rejectedWith('Cannot create status FAILED, because SUCCEEDED already exists');
    });
  });

  describe('validateStripeRequestAmount', () => {
    it('should accept 10 euros if user is in the positive', () => {
      const balance = { amount: {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      } } as BalanceResponse;
      const request: StripeRequest = {
        amount: {
          amount: 1000,
          currency: 'EUR',
          precision: 2,
        },
      };
      const res = StripeService.validateStripeRequestAmount(balance, request);
      expect(res).to.be.true;
    });
    it('should accept 10 euros if user less than 10 euros in the negative', () => {
      const balance = {
        amount: {
          amount: -800,
          currency: 'EUR',
          precision: 2,
        },
      } as BalanceResponse;
      const request: StripeRequest = {
        amount: {
          amount: 1000,
          currency: 'EUR',
          precision: 2,
        },
      };
      const res = StripeService.validateStripeRequestAmount(balance, request);
      expect(res).to.be.false;
    });
    it('should allow 11 euros if user more than 10 euros in the negative', () => {
      const balance = { amount: {
        amount: -1800,
        currency: 'EUR',
        precision: 2,
      } } as BalanceResponse;
      const request: StripeRequest = {
        amount: {
          amount: 1100,
          currency: 'EUR',
          precision: 2,
        },
      };
      const res = StripeService.validateStripeRequestAmount(balance, request);
      expect(res).to.be.true;
    });
    it('should allow 8,33 euros if user is -8,33', () => {
      const balance = { amount: {
        amount: -833,
        currency: 'EUR',
        precision: 2,
      } } as BalanceResponse;
      const request: StripeRequest = {
        amount: {
          amount: 833,
          currency: 'EUR',
          precision: 2,
        },
      };
      const res = StripeService.validateStripeRequestAmount(balance, request);
      expect(res).to.be.true;
    });
  });
  describe('handleWebhookEvent', async () => {
    const testHandleWebhookEvent = async (id: number, state: StripeDepositState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.false;

      let type;
      switch (state) {
        case StripeDepositState.CREATED:
          type = 'payment_intent.created';
          break;
        case StripeDepositState.PROCESSING:
          type = 'payment_intent.processing';
          break;
        case StripeDepositState.SUCCEEDED:
          type = 'payment_intent.succeeded';
          break;
        case StripeDepositState.FAILED:
          type = 'payment_intent.payment_failed';
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
            id: beforeStripeDeposit.stripeId,
          } as any,
        },
      } as Stripe.Event;

      await expect(ctx.stripeService.handleWebhookEvent(event)).to.eventually.be.fulfilled;

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.depositStatus.length)
        .to.equal(beforeStripeDeposit.depositStatus.length + 1);
      expect(afterStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.true;
    };

    it('should correctly handle payment_intent.created', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 0))[1];
      await testHandleWebhookEvent(id, StripeDepositState.CREATED);
    });
    it('should correctly handle payment_intent.processing', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 1))[1];
      await testHandleWebhookEvent(id, StripeDepositState.PROCESSING);
    });
    it('should correctly handle payment_intent.succeeded', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 2))[2];
      await testHandleWebhookEvent(id, StripeDepositState.SUCCEEDED);
    });
    it('should correctly handle payment_intent.payment_failed', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus.length === 2))[3];
      await testHandleWebhookEvent(id, StripeDepositState.FAILED);
    });
    it('should correctly do nothing when type is not listed', async () => {
      const { id } = ctx.stripeDeposits[ctx.stripeDeposits.length - 1];
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      const event = {
        type: 'unknown_stripe_event_to_test_stuff',
        api_version: STRIPE_API_VERSION,
        data: {
          object: {
            id: beforeStripeDeposit.stripeId,
          } as any,
        },
      } as Stripe.Event;

      await expect(ctx.stripeService.handleWebhookEvent(event)).to.be.eventually.fulfilled;
      const afterStripeDeposit = await StripeService.getStripeDeposit(id);

      expect(afterStripeDeposit.depositStatus.length)
        .to.equal(beforeStripeDeposit.depositStatus.length);
      expect(afterStripeDeposit.updatedAt.getTime())
        .to.equal(beforeStripeDeposit.updatedAt.getTime());
    });
  });
});
