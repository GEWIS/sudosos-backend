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
import chai from 'chai';
import sinon from 'sinon';

const { expect } = chai;
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import PaymentRequestService, { IllegalPaymentRequestTransitionError, InvalidPaymentRequestBeneficiaryError } from '../../../src/service/payment-request-service';
import PaymentRequestCheckoutService from '../../../src/service/payment-request-checkout-service';
import { StripeFactory } from '../../../src/service/stripe-service';
import PaymentRequestAttempt from '../../../src/entity/payment-request/payment-request-attempt';
import PaymentRequest from '../../../src/entity/payment-request/payment-request';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';

describe('PaymentRequestCheckoutService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    admin: User,
    member: User,
    posUser: User,
    service: PaymentRequestService,
    checkoutService: PaymentRequestCheckoutService,
  };

  let createStripeFactoryStub: sinon.SinonStub;
  let paymentIntentsCreateStub: sinon.SinonStub;

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const admin = await User.save({
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    });
    const member = await User.save({
      firstName: 'Member',
      type: UserType.MEMBER,
      active: true,
    });
    const posUser = await User.save({
      firstName: 'POS',
      type: UserType.POINT_OF_SALE,
      active: true,
    });

    ctx = {
      connection,
      admin,
      member,
      posUser,
      service: new PaymentRequestService(),
      checkoutService: new PaymentRequestCheckoutService(),
    };
  });

  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });

  beforeEach(() => {
    // `StripeService` builds its client via `StripeFactory.create()` in its
    // constructor, so stubbing the factory is enough to keep `startPayment`
    // from ever reaching Stripe's real API.
    paymentIntentsCreateStub = sinon.stub().resolves({
      id: `pi_${Math.random().toString(36).slice(2)}`,
      client_secret: 'secret_test',
    });
    createStripeFactoryStub = sinon.stub(StripeFactory, 'create').returns({
      paymentIntents: { create: paymentIntentsCreateStub },
    } as any);
  });

  afterEach(() => {
    createStripeFactoryStub.restore();
  });

  describe('startPayment', () => {
    it('creates a Stripe payment intent and records the attempt for a PENDING request', async () => {
      const request = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(1500),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const attemptCountBefore = await PaymentRequestAttempt.count();

      const { intentId, clientSecret } = await ctx.checkoutService.startPayment(request);

      expect(paymentIntentsCreateStub.calledOnce).to.equal(true);
      expect(intentId).to.be.a('string').and.not.empty;
      expect(clientSecret).to.equal('secret_test');

      const attemptCountAfter = await PaymentRequestAttempt.count();
      expect(attemptCountAfter).to.equal(attemptCountBefore + 1);

      const attempt = await PaymentRequestAttempt.findOne({
        where: { paymentRequestUuid: request.id },
        relations: { paymentIntent: true },
      });
      expect(attempt).to.not.equal(null);
      expect(attempt!.paymentIntent.stripeId).to.equal(intentId);
    });

    it('rejects a request that is not PENDING', async () => {
      const request = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await ctx.service.cancelPaymentRequest(request, ctx.admin);

      await expect(ctx.checkoutService.startPayment(request))
        .to.be.rejectedWith(IllegalPaymentRequestTransitionError);
      expect(paymentIntentsCreateStub.called).to.equal(false);
    });

    it('rejects a request whose beneficiary is no longer payable', async () => {
      // `createPaymentRequest` itself validates payability, so a request
      // for an ineligible (POS) beneficiary is built directly here to
      // simulate a beneficiary that became ineligible after the request
      // was created (e.g. converted to a POS account).
      const request = new PaymentRequest();
      request.for = ctx.posUser;
      request.createdBy = ctx.admin;
      request.amount = DineroTransformer.Instance.from(500);
      request.expiresAt = new Date(Date.now() + 86400000);

      await expect(ctx.checkoutService.startPayment(request))
        .to.be.rejectedWith(InvalidPaymentRequestBeneficiaryError);
      expect(paymentIntentsCreateStub.called).to.equal(false);
    });
  });
});
