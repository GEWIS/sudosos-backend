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
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import PaymentRequestService, {
  IllegalPaymentRequestTransitionError,
  InvalidPaymentRequestBeneficiaryError,
} from '../../../src/service/payment-request-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import PaymentRequest from '../../../src/entity/payment-request/payment-request';
import { PaymentRequestStatus } from '../../../src/entity/payment-request/payment-request-status';
import Transfer from '../../../src/entity/transactions/transfer';
import { PaymentRequestSeeder } from '../../seed';

describe('PaymentRequestService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    admin: User,
    member: User,
    inactive: User,
    invoiceUser: User,
    posUser: User,
    deleted: User,
    service: PaymentRequestService,
  };

  before(async () => {
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
    const inactive = await User.save({
      firstName: 'Inactive',
      type: UserType.MEMBER,
      active: false,
    });
    const invoiceUser = await User.save({
      firstName: 'Invoice',
      type: UserType.INVOICE,
      active: true,
    });
    const posUser = await User.save({
      firstName: 'POS',
      type: UserType.POINT_OF_SALE,
      active: true,
    });
    const deleted = await User.save({
      firstName: 'Deleted',
      type: UserType.MEMBER,
      active: false,
      deleted: true,
    });

    ctx = {
      connection,
      admin,
      member,
      inactive,
      invoiceUser,
      posUser,
      deleted,
      service: new PaymentRequestService(),
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('validatePayable', () => {
    it('accepts MEMBER users', () => {
      expect(() => PaymentRequestService.validatePayable(ctx.member)).to.not.throw();
    });
    it('accepts inactive users (alumni with debt is the whole point)', () => {
      expect(() => PaymentRequestService.validatePayable(ctx.inactive)).to.not.throw();
    });
    it('accepts INVOICE users', () => {
      expect(() => PaymentRequestService.validatePayable(ctx.invoiceUser)).to.not.throw();
    });
    it('rejects POINT_OF_SALE users', () => {
      expect(() => PaymentRequestService.validatePayable(ctx.posUser))
        .to.throw(InvalidPaymentRequestBeneficiaryError);
    });
    it('rejects soft-deleted users', () => {
      expect(() => PaymentRequestService.validatePayable(ctx.deleted))
        .to.throw(InvalidPaymentRequestBeneficiaryError);
    });
    it('rejects missing user', () => {
      expect(() => PaymentRequestService.validatePayable(null as unknown as User))
        .to.throw(InvalidPaymentRequestBeneficiaryError);
    });
  });

  describe('createPaymentRequest', () => {
    const futureDate = (): Date => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastDate = (): Date => new Date(Date.now() - 1000);

    it('persists a new PENDING request with immutable amount', async () => {
      const amount = DineroTransformer.Instance.from(1234);
      const created = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount,
        expiresAt: futureDate(),
        description: 'Unit-test create',
      });
      expect(created.id).to.be.a('string').with.lengthOf(36);
      expect(created.amount.getAmount()).to.equal(1234);
      expect(created.status).to.equal(PaymentRequestStatus.PENDING);
      expect(created.paidAt).to.equal(null);
      expect(created.cancelledAt).to.equal(null);
      expect(created.description).to.equal('Unit-test create');

      const reloaded = await ctx.service.getPaymentRequest(created.id);
      expect(reloaded).to.not.equal(null);
      expect(reloaded!.id).to.equal(created.id);
    });

    it('rejects past expiresAt', async () => {
      await expect(ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(100),
        expiresAt: pastDate(),
      })).to.be.rejectedWith(/expiresAt/);
    });

    it('rejects zero or negative amount', async () => {
      await expect(ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(0),
        expiresAt: futureDate(),
      })).to.be.rejectedWith(/amount/);
    });

    it('rejects ineligible beneficiary (POS)', async () => {
      await expect(ctx.service.createPaymentRequest({
        for: ctx.posUser,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: futureDate(),
      })).to.be.rejectedWith(InvalidPaymentRequestBeneficiaryError);
    });

    it('rejects soft-deleted beneficiary', async () => {
      await expect(ctx.service.createPaymentRequest({
        for: ctx.deleted,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: futureDate(),
      })).to.be.rejectedWith(InvalidPaymentRequestBeneficiaryError);
    });
  });

  describe('derived status', () => {
    it('PENDING -> PAID when paidAt is set', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      expect(r.status).to.equal(PaymentRequestStatus.PENDING);
      const paid = await ctx.service.markPaid(r);
      expect(paid.status).to.equal(PaymentRequestStatus.PAID);
    });

    it('PENDING -> CANCELLED when cancelled', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const cancelled = await ctx.service.cancelPaymentRequest(r, ctx.admin);
      expect(cancelled.status).to.equal(PaymentRequestStatus.CANCELLED);
      expect(cancelled.cancelledBy!.id).to.equal(ctx.admin.id);
    });

    it('PENDING -> EXPIRED when expiresAt passes', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 500),
      });
      expect(r.status).to.equal(PaymentRequestStatus.PENDING);
      // Simulate the clock rolling past expiry.
      r.expiresAt = new Date(Date.now() - 1000);
      expect(r.status).to.equal(PaymentRequestStatus.EXPIRED);
    });

    it('PAID precedence beats EXPIRED', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 1000),
      });
      r.paidAt = new Date();
      r.expiresAt = new Date(Date.now() - 1000);
      expect(r.status).to.equal(PaymentRequestStatus.PAID);
    });
  });

  describe('state machine', () => {
    it('rejects cancelling a PAID request', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await ctx.service.markPaid(r);
      await expect(ctx.service.cancelPaymentRequest(r, ctx.admin))
        .to.be.rejectedWith(IllegalPaymentRequestTransitionError);
    });

    it('rejects cancelling a CANCELLED request', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await ctx.service.cancelPaymentRequest(r, ctx.admin);
      await expect(ctx.service.cancelPaymentRequest(r, ctx.admin))
        .to.be.rejectedWith(IllegalPaymentRequestTransitionError);
    });

    it('markPaid is idempotent on PAID', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const firstPaid = await ctx.service.markPaid(r);
      const firstPaidAt = firstPaid.paidAt;
      const again = await ctx.service.markPaid(firstPaid);
      expect(again.paidAt).to.deep.equal(firstPaidAt);
    });

    it('markPaid refuses CANCELLED', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await ctx.service.cancelPaymentRequest(r, ctx.admin);
      await expect(ctx.service.markPaid(r))
        .to.be.rejectedWith(IllegalPaymentRequestTransitionError);
    });

    it('markPaid promotes EXPIRED requests to PAID (late webhook)', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(500),
        expiresAt: new Date(Date.now() + 86400000),
      });
      // Force-expire by rewriting expiry.
      r.expiresAt = new Date(Date.now() - 1000);
      await PaymentRequest.save(r);
      expect(r.status).to.equal(PaymentRequestStatus.EXPIRED);
      const paid = await ctx.service.markPaid(r);
      expect(paid.status).to.equal(PaymentRequestStatus.PAID);
    });
  });

  describe('markFulfilledExternally', () => {
    it('creates a void->user Transfer and flips to PAID', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(2500),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const transferCountBefore = await Transfer.count();
      const updated = await ctx.service.markFulfilledExternally(
        r, 'Bank transfer, ref 12345', ctx.admin,
      );

      expect(updated.status).to.equal(PaymentRequestStatus.PAID);
      expect(updated.fulfilledBy).to.not.equal(null);
      expect(updated.fulfilledBy!.id).to.equal(ctx.admin.id);
      const transferCountAfter = await Transfer.count();
      expect(transferCountAfter).to.equal(transferCountBefore + 1);

      const newTransfer = (await Transfer.find({
        relations: { to: true },
        order: { createdAt: 'DESC' },
        take: 1,
      }))[0];
      expect(newTransfer.to.id).to.equal(ctx.member.id);
      expect(newTransfer.description).to.include(r.id);
      expect(newTransfer.description).to.include('Bank transfer, ref 12345');
      // Actor id is recorded in the description so the Transfer row alone
      // identifies the admin that triggered the escape hatch.
      expect(newTransfer.description).to.include(`by ${ctx.admin.id}`);
      expect(newTransfer.amountInclVat.getAmount()).to.equal(2500);
    });

    it('persists fulfilledBy across a reload', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(400),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await ctx.service.markFulfilledExternally(r, 'cash', ctx.admin);
      const reloaded = await ctx.service.getPaymentRequest(r.id);
      expect(reloaded).to.not.equal(null);
      expect(reloaded!.fulfilledBy).to.not.equal(null);
      expect(reloaded!.fulfilledBy!.id).to.equal(ctx.admin.id);
    });

    it('refuses to run without a reason', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(100),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await expect(ctx.service.markFulfilledExternally(r, '   ', ctx.admin))
        .to.be.rejectedWith(/reason/);
    });

    it('refuses to run without an actor', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(100),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await expect(ctx.service.markFulfilledExternally(r, 'cash', null as unknown as User))
        .to.be.rejectedWith(/actor/);
    });

    it('refuses a non-PENDING source', async () => {
      const r = await ctx.service.createPaymentRequest({
        for: ctx.member,
        createdBy: ctx.admin,
        amount: DineroTransformer.Instance.from(100),
        expiresAt: new Date(Date.now() + 86400000),
      });
      await ctx.service.cancelPaymentRequest(r, ctx.admin);
      await expect(ctx.service.markFulfilledExternally(r, 'too late', ctx.admin))
        .to.be.rejectedWith(IllegalPaymentRequestTransitionError);
    });
  });

  describe('listing with status filter', () => {
    before(async () => {
      // Clear any rows from earlier tests before seeding the known distribution.
      // TypeORM rejects `.delete({})` (empty criteria); `.clear()` uses TRUNCATE
      // which MariaDB refuses on a table referenced by a foreign key. Use the
      // query builder to emit a plain DELETE with no WHERE.
      await PaymentRequest.createQueryBuilder().delete().execute();
      await new PaymentRequestSeeder().seed([ctx.member, ctx.invoiceUser], ctx.admin, 8);
    });

    it('returns all statuses when no filter is provided', async () => {
      const [rows, total] = await ctx.service.getPaymentRequests({});
      expect(total).to.equal(8);
      expect(rows.length).to.equal(8);
    });

    it('filters by derived status', async () => {
      const [pending] = await ctx.service.getPaymentRequests({
        status: [PaymentRequestStatus.PENDING],
      });
      expect(pending.every((r) => r.status === PaymentRequestStatus.PENDING)).to.equal(true);
    });

    it('paginates with derived status filter', async () => {
      const [page] = await ctx.service.getPaymentRequests(
        { status: [PaymentRequestStatus.PAID] },
        { take: 1, skip: 0 },
      );
      expect(page.length).to.be.at.most(1);
    });

    it('filters by forId', async () => {
      const [rows] = await ctx.service.getPaymentRequests({ forId: ctx.member.id });
      expect(rows.every((r) => r.for.id === ctx.member.id)).to.equal(true);
    });
  });
});
