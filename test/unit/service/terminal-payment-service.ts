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
import sinon from 'sinon';
import Stripe from 'stripe';
import TerminalPaymentService from '../../../src/service/terminal-payment-service';
import { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import TerminalPayment from '../../../src/entity/transactions/terminal/terminal-payment';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Config from '../../../src/config';
import { defaultBefore, finishTestDB } from '../../helpers/test-helpers';
import TerminalPaymentSeeder from '../../seed/ledger/terminal-payment-seeder';

describe('TerminalPaymentService', () => {
  let ctx: {
    connection: DataSource,
    service: TerminalPaymentService,
    users: User[],
    terminalPayments: TerminalPayment[],
  };

  const stubs: sinon.SinonStub[] = [];
  let originalStripeKey: string | undefined;
  let paymentIntentsCreateStub: sinon.SinonStub;
  let readersProcessIntentStub: sinon.SinonStub;

  beforeAll(async () => {
    originalStripeKey = process.env.STRIPE_PRIVATE_KEY;
    process.env.STRIPE_PRIVATE_KEY = process.env.STRIPE_PRIVATE_KEY || 'sk_test_dummy';
    Config.reset();

    ctx = {
      ...(await defaultBefore()),
    } as any;

    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    await User.save(adminUser);

    const { terminalPayments } = await new TerminalPaymentSeeder().seed([adminUser]);

    ctx.users = [adminUser];
    ctx.terminalPayments = terminalPayments;
    ctx.service = new TerminalPaymentService();
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
    const sampleStripe = new Stripe('sk_test_dummy', { apiVersion: STRIPE_API_VERSION });
    paymentIntentsCreateStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.paymentIntents), 'create')
      .resolves({ id: 'pi_fake', client_secret: 'cs_fake' } as any);
    readersProcessIntentStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.terminal.readers), 'processPaymentIntent')
      .resolves({ id: 'reader_fake' } as any);
    stubs.push(paymentIntentsCreateStub, readersProcessIntentStub);
  })

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('#verifyTerminalPaymentRequest', () => {
    it.todo('should return a transaction context for a valid request');
    it.todo('should reject an invalid transaction request');
  });

  describe('#getTerminalPayment', () => {
    it.todo('should return the terminal payment with the given id');
    it.todo('should return null if no terminal payment exists with the given id');
  });

  describe('#createTerminalPayment', () => {
    it.todo('should create a new TerminalPayment together with a TmpTransaction and Stripe payment intent');
    it.todo('should throw if the transaction request cannot be transformed into a transaction entity');
  });

  describe('#startTerminalPayment', () => {
    it.todo('should call the Stripe service with the matching payment intent id');
    it.todo('should throw if the terminal payment does not exist');
  });
});
