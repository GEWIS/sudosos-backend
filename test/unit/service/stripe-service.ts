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

describe('StripeService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    users: User[],
    stripeDeposits: StripeDeposit[],
    stripeService: StripeService,
    dineroTransformer: DineroTransformer,
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const stripeDeposits = await seedStripeDeposits(users);

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
    await ctx.connection.close();
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
      expect(stripeDeposit.depositStatus.length).to.equal(1);
      expect(stripeDeposit.depositStatus[0].state).to.equal(StripeDepositState.CREATED);
    });
  });

  describe('createNewDepositStatus', () => {
    const testStatusCreation = async (id: number, state: StripeDepositState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.false;

      const status = await StripeService.createNewDepositStatus(id, state);
      expect(status.state).to.equal(state);

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.depositStatus.length)
        .to.equal(beforeStripeDeposit.depositStatus.length + 1);
      expect(afterStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.true;

      await expect(StripeService.createNewDepositStatus(id, state))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    };
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

      await expect(StripeService.createNewDepositStatus(id, state))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    });
    it('should not create "SUCCEEDED" state when "FAILED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus
        .some((s) => s.state === StripeDepositState.FAILED)))[0];
      const state = StripeDepositState.SUCCEEDED;

      await expect(StripeService.createNewDepositStatus(id, state))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because FAILED already exists');
    });
    it('should not create "FAILED" state when "SUCCEEDED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.depositStatus
        .some((s) => s.state === StripeDepositState.SUCCEEDED)))[0];
      const state = StripeDepositState.FAILED;

      await expect(StripeService.createNewDepositStatus(id, state))
        .to.eventually.be.rejectedWith('Cannot create status FAILED, because SUCCEEDED already exists');
    });
  });

  describe('handleWebhookEvent', async () => {
    const testHandleWebhookEvent = async (id: number, state: StripeDepositState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.false;

      let type;
      switch (state) {
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

      await expect(StripeService.handleWebhookEvent(event)).to.eventually.be.fulfilled;

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.depositStatus.length)
        .to.equal(beforeStripeDeposit.depositStatus.length + 1);
      expect(afterStripeDeposit.depositStatus.some((s) => s.state === state)).to.be.true;
    };

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

      await expect(StripeService.handleWebhookEvent(event)).to.be.eventually.fulfilled;
      const afterStripeDeposit = await StripeService.getStripeDeposit(id);

      expect(afterStripeDeposit.depositStatus.length)
        .to.equal(beforeStripeDeposit.depositStatus.length);
      expect(afterStripeDeposit.updatedAt.getTime())
        .to.equal(beforeStripeDeposit.updatedAt.getTime());
    });
  });
});
