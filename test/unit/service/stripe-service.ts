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
 *
 *  @license
 */

import { DataSource } from 'typeorm';
import { expect } from 'chai';
import Stripe from 'stripe';
import User from '../../../src/entity/user/user';
import Database, { AppDataSource } from '../../../src/database/database';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import StripeService, { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripePaymentIntentState } from '../../../src/entity/stripe/stripe-payment-intent-status';
import BalanceResponse from '../../../src/controller/response/balance-response';
import { StripeRequest } from '../../../src/controller/request/stripe-request';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { DepositSeeder, UserSeeder } from '../../seed';

describe('StripeService', async (): Promise<void> => {
  let shouldSkip: boolean;

  let ctx: {
    connection: DataSource,
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
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const { stripeDeposits } = await new DepositSeeder().seed(users);

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
    await finishTestDB(ctx.connection);
  });

  describe('getProcessingStripeDepositsFromUser', () => {
    it('should return the correct deposits', async () => {
      const processingDeposits = ctx.stripeDeposits.filter((d) => {
        return d.stripePaymentIntent.paymentIntentStatuses.length === 2
          && d.stripePaymentIntent.paymentIntentStatuses
            .some((s) => s.state === StripePaymentIntentState.PROCESSING);
      });

      const user = processingDeposits[0].to;
      const depositsFromUser = processingDeposits.filter((d) => d.to.id === user.id);

      const deposits = await StripeService.getProcessingStripeDepositsFromUser(user.id);
      expect(depositsFromUser.length).to.equal(deposits.length);
      deposits.forEach((d) => {
        expect(d.to.id).to.equal(user.id);
        const states = d.depositStatus
          .map((s) => s.state);
        expect(states[states.length - 1]).to.equal(StripePaymentIntentState.PROCESSING);
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

      expect(intent.stripeId).to.equal(stripeDeposit.stripePaymentIntent.stripeId);
      expect(stripeDeposit.stripePaymentIntent.paymentIntentStatuses.length).to.equal(0);
    });
  });

  describe('createNewPaymentIntentStatus', () => {
    const testStatusCreation = async (id: number, state: StripePaymentIntentState) => {
      const beforeStripeDeposit = await StripeService.getStripeDeposit(id);

      // Precondition: state does not yet exist
      expect(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === state))
        .to.be.false;

      const status = await AppDataSource.manager.transaction(async (manager) => new StripeService(manager).createNewPaymentIntentStatus(id, state));
      expect(status.state).to.equal(state);

      const afterStripeDeposit = await StripeService.getStripeDeposit(id);
      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length)
        .to.equal(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length + 1);
      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === state))
        .to.be.true;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeService(manager).createNewPaymentIntentStatus(id, state)))
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
      let deposit = await StripeService.getStripeDeposit(id, ['transfer', 'transfer.to', 'to']);
      expect(deposit.transfer).to.be.null;

      await testStatusCreation(id, StripePaymentIntentState.SUCCEEDED);

      deposit = await StripeService.getStripeDeposit(id, ['transfer', 'transfer.to', 'to']);
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

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith(`Status ${state} already exists.`);
    });
    it('should not create "SUCCEEDED" state when "FAILED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.FAILED)))[0];
      const state = StripePaymentIntentState.SUCCEEDED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status SUCCEEDED, because FAILED already exists');
    });
    it('should not create "FAILED" state when "SUCCEEDED" already exists', async () => {
      const { id } = (ctx.stripeDeposits.filter((d) => d.stripePaymentIntent.paymentIntentStatuses
        .some((s) => s.state === StripePaymentIntentState.SUCCEEDED)))[0];
      const state = StripePaymentIntentState.FAILED;

      await expect(AppDataSource.manager.transaction(async (manager) => new StripeService(manager).createNewPaymentIntentStatus(id, state)))
        .to.eventually.be.rejectedWith('Cannot create status FAILED, because SUCCEEDED already exists');
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

      await expect(ctx.stripeService.handleWebhookEvent(event)).to.eventually.be.fulfilled;

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

      await expect(ctx.stripeService.handleWebhookEvent(event)).to.be.eventually.fulfilled;
      const afterStripeDeposit = await StripeService.getStripeDeposit(id);

      expect(afterStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length)
        .to.equal(beforeStripeDeposit.stripePaymentIntent.paymentIntentStatuses.length);
      expect(afterStripeDeposit.updatedAt.getTime())
        .to.equal(beforeStripeDeposit.updatedAt.getTime());
    });
  });
});

describe('validateStripeRequestMinimumAmount', async () => {
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
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should accept 10 euros if user balance is exactly zero', () => {
    const balance = { amount: {
      amount: 0,
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
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should disallow 9 euros if user is in the positive', () => {
    const balance = { amount: {
      amount: 1,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 900,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.false;
  });
  it('should disallow 9 euros if user balance is exactly zero', () => {
    const balance = { amount: {
      amount: 0,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 900,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.false;
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
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow 5 euros if user is 5 euros in the negative', () => {
    const balance = {
      amount: {
        amount: -500,
        currency: 'EUR',
        precision: 2,
      },
    } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 500,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow 11 euros if user is 10 euros in the negative', () => {
    const balance = {
      amount: {
        amount: -1000,
        currency: 'EUR',
        precision: 2,
      },
    } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 1100,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
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
    const res = StripeService.validateStripeRequestMinimumAmount(balance, request);
    expect(res).to.be.true;
  });
});

describe('validateStripeRequestMaximumAmount', async () => {
  it('should allow 10 euros if user is in the positive significantly less than 150 euros', () => {
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
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow 10 euros if user is balance will become exactly 150 euros', () => {
    const balance = { amount: {
      amount: 14000,
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
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow 150 euros if user balance is exactly zero', () => {
    const balance = { amount: {
      amount: 0,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 15000,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow 160 euros if user balance is more than 150 euros negative', () => {
    const balance = { amount: {
      amount: -16000,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 16000,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow max balance if user balance is more than 150 euros negative', () => {
    const balance = { amount: {
      amount: -20000,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 35000,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should allow 18,33 euros if user balance is exactly 131,67 euros', () => {
    const balance = { amount: {
      amount: 13167,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 1833,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.true;
  });
  it('should disallow 10 euros if user balance will become more than 150 euros', () => {
    const balance = { amount: {
      amount: 14600,
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
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.false;
  });
  it('should disallow 155 euros if user balance is exactly zero', () => {
    const balance = { amount: {
      amount: 0,
      currency: 'EUR',
      precision: 2,
    } } as BalanceResponse;
    const request: StripeRequest = {
      amount: {
        amount: 15500,
        currency: 'EUR',
        precision: 2,
      },
    };
    const res = StripeService.validateStripeRequestMaximumAmount(balance, request);
    expect(res).to.be.false;
  });
});

