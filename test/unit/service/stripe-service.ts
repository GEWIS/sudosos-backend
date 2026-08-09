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
import User, { UserType } from '../../../src/entity/user/user';
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
import TerminalPaymentSeeder from '../../seed/ledger/terminal-payment-seeder';
import TerminalPayment, { TerminalPaymentState } from '../../../src/entity/transactions/terminal/terminal-payment';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Transfer from '../../../src/entity/transactions/transfer';
import { AppDataSource } from '../../../src/database/database';
import { toMySQLString } from '../../../src/helpers/timestamps';
import Config from '../../../src/config';

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

// Not wrapped in describe.skipIf(shouldSkipStripe): this aggregates already-
// seeded database rows and never calls the real Stripe API, matching the
// pattern the two describe blocks above already use for pure-logic tests.
describe('StripeService#getStripeSettlementReport', async (): Promise<void> => {
  let connection: DataSource;
  let service: StripeService;
  let user: User;
  let posRevision: PointOfSaleRevision;
  // Seeded once here. TerminalPaymentSeeder#seed builds a fresh catalogue
  // when given neither points of sale nor transactions, and a second one
  // collides on ProductCategory names with the one already in the database
  // -- so it must only ever be called once per suite. Individual tests that
  // need another terminal payment use #init(user, posRevision) instead, which
  // does not touch the catalogue.
  let seededDeposit: { stripeDeposit: StripeDeposit, transfer: Transfer };
  let seededPaidPayment: TerminalPayment;
  let originalStripeKey: string | undefined;

  beforeAll(async () => {
    // The aggregation query never touches the real Stripe SDK, but the
    // StripeService constructor unconditionally requires a key to exist.
    originalStripeKey = process.env.STRIPE_PRIVATE_KEY;
    process.env.STRIPE_PRIVATE_KEY = process.env.STRIPE_PRIVATE_KEY || 'sk_test_dummy';
    Config.reset();

    connection = await Database.initialize();
    await truncateAllTables(connection);
    service = new StripeService();

    user = await User.save({
      firstName: 'Settlement Report User',
      type: UserType.LOCAL_USER,
      active: true,
      tosRequired: false,
    } as User);

    seededDeposit = await new DepositSeeder().init(user);

    const { catalogue, terminalPayments } = await new TerminalPaymentSeeder().seed([user]);
    posRevision = catalogue!.pointOfSale.barRevision;
    const paidPayment = terminalPayments.find((t) => t.getState() === TerminalPaymentState.PAID);
    expect(paidPayment, 'Precondition failed: seeder did not produce a PAID terminal payment').to.not.be.undefined;
    seededPaidPayment = paidPayment!;
  });

  afterAll(async () => {
    process.env.STRIPE_PRIVATE_KEY = originalStripeKey;
    Config.reset();
    await finishTestDB(connection);
  });

  /**
   * Backdates a settled deposit's Transfer or a PAID terminal payment's
   * finalTransaction to an exact, known timestamp, so the boundary test below
   * does not depend on real insert timing. Mirrors the same raw-UPDATE
   * approach `test/helpers/transaction-factory.ts` already uses to backdate a
   * transaction's createdAt.
   */
  async function backdate(table: 'transfer' | 'transaction', id: number, createdAt: Date): Promise<void> {
    await AppDataSource.query(`UPDATE \`${table}\` SET createdAt = '${toMySQLString(createdAt)}' WHERE id = ${id}`);
  }

  it('should sum deposits and terminal payments into one total', async () => {
    // Ground truth computed independently of the query under test, so this is
    // not just re-checking the same aggregation logic against itself.
    const allDeposits = await StripeDeposit.find({ relations: { transfer: true, stripePaymentIntent: true } });
    const settledDeposits = allDeposits.filter((d) => d.transfer != null);
    const depositTotal = settledDeposits.reduce((sum, d) => sum + d.stripePaymentIntent.amount.getAmount(), 0);

    const allTerminalPayments = await TerminalPayment.find({
      relations: { finalTransaction: true, stripePaymentIntent: true },
    });
    const paidTerminalPayments = allTerminalPayments.filter((t) => t.finalTransaction != null);
    const terminalTotal = paidTerminalPayments.reduce((sum, t) => sum + t.stripePaymentIntent.amount.getAmount(), 0);

    const report = await service.getStripeSettlementReport(new Date(0), new Date('9999-01-01T00:00:00.000Z'));

    expect(report.depositCount).to.equal(settledDeposits.length);
    expect(report.depositTotalAmount.getAmount()).to.equal(depositTotal);
    expect(report.terminalPaymentCount).to.equal(paidTerminalPayments.length);
    expect(report.terminalPaymentTotalAmount.getAmount()).to.equal(terminalTotal);
    expect(report.totalCount).to.equal(settledDeposits.length + paidTerminalPayments.length);
    expect(report.totalAmount.getAmount()).to.equal(depositTotal + terminalTotal);
    // Sanity check: both categories actually contributed, so this test would
    // fail if either query silently matched nothing.
    expect(settledDeposits.length).to.be.greaterThan(0);
    expect(paidTerminalPayments.length).to.be.greaterThan(0);
  });

  it('should exclude an unsettled deposit and a non-PAID terminal payment', async () => {
    const before = await service.getStripeSettlementReport(new Date(0), new Date('9999-01-01T00:00:00.000Z'));

    // Unsettled deposit: created via #init like the settled one, then its
    // transfer is explicitly cleared. Uses update() with a real `null` rather
    // than save() with `undefined`: TypeORM's save() treats an `undefined`
    // property as "leave this column alone", so it would silently leave the
    // existing transfer FK in place instead of clearing it.
    const { stripeDeposit: unsettledDeposit } = await new DepositSeeder().init(user);
    await StripeDeposit.update(unsettledDeposit.id, { transfer: null } as any);

    // CREATED terminal payment: #init alone never attaches a finalTransaction.
    await new TerminalPaymentSeeder().init(user, posRevision);

    const after = await service.getStripeSettlementReport(new Date(0), new Date('9999-01-01T00:00:00.000Z'));

    expect(after.depositCount, 'the unsettled deposit must not be counted').to.equal(before.depositCount);
    expect(after.depositTotalAmount.getAmount()).to.equal(before.depositTotalAmount.getAmount());
    expect(after.terminalPaymentCount, 'the CREATED payment must not be counted').to.equal(before.terminalPaymentCount);
    expect(after.terminalPaymentTotalAmount.getAmount()).to.equal(before.terminalPaymentTotalAmount.getAmount());
  });

  it('should treat fromDate as inclusive and toDate as exclusive, for both categories', async () => {
    // Two different fixed, far-past timestamps: nothing else in this suite can
    // naturally land inside the 1ms windows below, and using two different
    // instants (rather than reusing one) proves the two categories are
    // filtered independently, not by a shared, accidentally-correct query.
    const depositBoundary = new Date('2020-06-15T12:00:00.000Z');
    const terminalBoundary = new Date('2021-09-01T08:00:00.000Z');
    await backdate('transfer', seededDeposit.transfer.id, depositBoundary);
    await backdate('transaction', seededPaidPayment.finalTransaction!.id, terminalBoundary);

    const depositInclusive = await service.getStripeSettlementReport(depositBoundary, new Date(depositBoundary.getTime() + 1));
    expect(depositInclusive.depositCount, 'deposit fromDate should be inclusive').to.equal(1);
    expect(depositInclusive.terminalPaymentCount, 'deposit window should not match the terminal payment').to.equal(0);

    const depositExclusive = await service.getStripeSettlementReport(new Date(depositBoundary.getTime() - 1), depositBoundary);
    expect(depositExclusive.depositCount, 'deposit toDate should be exclusive').to.equal(0);

    const terminalInclusive = await service.getStripeSettlementReport(terminalBoundary, new Date(terminalBoundary.getTime() + 1));
    expect(terminalInclusive.terminalPaymentCount, 'terminal fromDate should be inclusive').to.equal(1);
    expect(terminalInclusive.depositCount, 'terminal window should not match the deposit').to.equal(0);

    const terminalExclusive = await service.getStripeSettlementReport(new Date(terminalBoundary.getTime() - 1), terminalBoundary);
    expect(terminalExclusive.terminalPaymentCount, 'terminal toDate should be exclusive').to.equal(0);
  });

  it('should return zero counts and a zero total for a date range with no matches', async () => {
    const report = await service.getStripeSettlementReport(
      new Date('1990-01-01T00:00:00.000Z'),
      new Date('1990-01-02T00:00:00.000Z'),
    );

    expect(report.depositCount).to.equal(0);
    expect(report.depositTotalAmount.getAmount()).to.equal(0);
    expect(report.terminalPaymentCount).to.equal(0);
    expect(report.terminalPaymentTotalAmount.getAmount()).to.equal(0);
    expect(report.totalCount).to.equal(0);
    expect(report.totalAmount.getAmount()).to.equal(0);
  });
});

