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
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import StripeService from '../../../src/service/stripe-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { StripePaymentIntentState } from '../../../src/entity/stripe/stripe-payment-intent-status';
import BalanceResponse from '../../../src/controller/response/balance-response';
import { StripeRequest } from '../../../src/controller/request/stripe-request';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import { DepositSeeder, UserSeeder } from '../../seed';

const shouldSkipStripe = (process.env.STRIPE_PUBLIC_KEY === '' || process.env.STRIPE_PUBLIC_KEY === undefined
  || process.env.STRIPE_PRIVATE_KEY === '' || process.env.STRIPE_PRIVATE_KEY === undefined);

describe.skipIf(shouldSkipStripe)('StripeService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    users: User[],
    stripeDeposits: StripeDeposit[],
    stripeService: StripeService,
    dineroTransformer: DineroTransformer,
  };

  beforeAll(async () => {
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

  afterAll(async () => {
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
        const states = d.stripePaymentIntent.paymentIntentStatuses
          .map((s) => s.state);
        expect(states[states.length - 1]).to.equal(StripePaymentIntentState.PROCESSING);
      });
    });
  });

  describe('createStripeDeposit', () => {
    it('should correctly create a payment intent', async () => {
      const countBefore = await StripeDeposit.count();

      const { deposit, clientSecret } = await ctx.stripeService.createStripeDeposit(
        ctx.users[0], ctx.dineroTransformer.from(1500),
      );

      expect(deposit).to.not.be.undefined;
      expect(clientSecret).to.be.a('string');

      const countAfter = await StripeDeposit.count();
      const stripeDeposit = await StripeService.getStripeDeposit(deposit.id);

      expect(stripeDeposit).to.not.be.undefined;
      expect(stripeDeposit.id).to.equal(deposit.id);
      expect(countAfter).to.equal(countBefore + 1);

      expect(deposit.stripePaymentIntent.stripeId).to.equal(stripeDeposit.stripePaymentIntent.stripeId);
      expect(stripeDeposit.stripePaymentIntent.paymentIntentStatuses.length).to.equal(0);
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
