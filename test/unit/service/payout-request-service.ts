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
import User from '../../../src/entity/user/user';
import PayoutRequest from '../../../src/entity/transactions/payout-request';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { seedPayoutRequests, seedUsers } from '../../seed';
import Database from '../../../src/database/database';
import PayoutRequestService from '../../../src/service/payout-request-service';
import { PayoutRequestState } from '../../../src/entity/transactions/payout-request-status';
import PayoutRequestRequest from '../../../src/controller/request/payout-request-request';

describe('PayoutRequestService', () => {
  let ctx: {
    connection: Connection,
    users: User[],
    payoutRequests: PayoutRequest[],
    dineroTransformer: DineroTransformer,
    validPayoutRequestRequest: PayoutRequestRequest,
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const payoutRequests = await seedPayoutRequests(users);

    const dineroTransformer = DineroTransformer.Instance;

    const validPayoutRequestRequest: PayoutRequestRequest = {
      amount: {
        amount: 3900,
        precision: 2,
        currency: 'EUR',
      },
      bankAccountNumber: 'NL22 ABNA 0528195913',
      bankAccountName: 'Studievereniging GEWIS',
    };

    ctx = {
      connection,
      users,
      payoutRequests,
      dineroTransformer,
      validPayoutRequestRequest,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('getPayoutRequests', () => {
    it('should return all payout requests', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { _pagination, records } = await PayoutRequestService.getPayoutRequests({});

      expect(records.length).to.equal(ctx.payoutRequests.length);

      const ids = ctx.payoutRequests.map((req) => req.id);
      records.forEach((req) => {
        expect(ids).to.include(req.id);
      });

      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.take).to.be.undefined;
      expect(_pagination.count).to.equal(ctx.payoutRequests.length);
    });

    it('should return payout request with specific ID', async () => {
      const { id } = ctx.payoutRequests[0];
      const { records } = await PayoutRequestService.getPayoutRequests({ id });

      expect(records.length).to.equal(1);
      expect(records[0].id).to.equal(id);
    });

    it('should return all payout requests with specific requested by id', async () => {
      const requestedById = ctx.payoutRequests[0].requestedBy.id;
      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => req.requestedBy.id === requestedById);
      const ids = actualPayoutRequests.map((req) => req.id);

      const { records } = await PayoutRequestService.getPayoutRequests({ requestedById });

      expect(records.length).to.equal(actualPayoutRequests.length);
      records.forEach((req) => {
        expect(ids).to.include(req.id);
      });
    });

    it('should return all payout requests with specific approved by id', async () => {
      const approvedById = ctx.payoutRequests
        .find((req) => req.approvedBy !== undefined).approvedBy.id;
      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => req.approvedBy !== undefined && req.approvedBy.id === approvedById);
      const ids = actualPayoutRequests.map((req) => req.id);

      const { records } = await PayoutRequestService.getPayoutRequests({ approvedById });

      expect(records.length).to.equal(actualPayoutRequests.length);
      records.forEach((req) => {
        expect(ids).to.include(req.id);
      });
    });

    const testPayoutRequestsWithState = async (status: PayoutRequestState[]) => {
      const actualPayoutRequests = ctx.payoutRequests
        .filter((req) => {
          if (req.payoutRequestStatus.length === 0) return false;
          return status.includes(req.payoutRequestStatus
            .sort((a, b) => (
              a.createdAt.getTime() < b.createdAt.getTime() ? 1 : -1))[0].state);
        });
      const ids = actualPayoutRequests.map((req) => req.id);

      const { records } = await PayoutRequestService.getPayoutRequests({ status });

      expect(records.length).to.equal(actualPayoutRequests.length);
      records.forEach((req) => {
        expect(ids).to.include(req.id);
        expect(status).to.include(req.status);
      });
    };

    it('should return all payout requests with CREATED status', async () => {
      await testPayoutRequestsWithState([PayoutRequestState.CREATED]);
    });

    it('should return all payout requests with APPROVED status', async () => {
      await testPayoutRequestsWithState([PayoutRequestState.APPROVED]);
    });

    it('should return all payout requests with DENIED status', async () => {
      await testPayoutRequestsWithState([PayoutRequestState.DENIED]);
    });

    it('should return all payout requests with CANCELLED status', async () => {
      await testPayoutRequestsWithState([PayoutRequestState.CANCELLED]);
    });

    it('should return all payout requests with APPROVED or DENIED status', async () => {
      await testPayoutRequestsWithState([PayoutRequestState.APPROVED, PayoutRequestState.DENIED]);
    });
  });

  describe('getSinglePayoutRequest', () => {
    it('should return a single payout request', async () => {
      const { id } = ctx.payoutRequests[0];

      const payoutRequest = await PayoutRequestService.getSinglePayoutRequest(id);
      expect(payoutRequest).to.not.be.undefined;
      expect(payoutRequest.id).to.equal(id);
    });

    it('should return undefined if payout request does not exist', async () => {
      const { id } = ctx.payoutRequests[ctx.payoutRequests.length - 1];

      const payoutRequest = await PayoutRequestService.getSinglePayoutRequest(id + 1000);
      expect(payoutRequest).to.be.undefined;
    });
  });

  describe('createPayoutRequest', () => {
    it('should correctly create payout request for user', async () => {
      const lengthBefore = await PayoutRequest.count();
      const user = ctx.users[0];
      const payoutRequest = await PayoutRequestService
        .createPayoutRequest(ctx.validPayoutRequestRequest, user);

      expect(payoutRequest).to.not.be.undefined;
      expect(await PayoutRequest.count()).to.equal(lengthBefore + 1);
      expect(payoutRequest.bankAccountNumber).to
        .equal(ctx.validPayoutRequestRequest.bankAccountNumber);
      expect(payoutRequest.bankAccountName).to
        .equal(ctx.validPayoutRequestRequest.bankAccountName);
      expect(payoutRequest.status.length).to.equal(1);
      expect(payoutRequest.status[0].state).to.equal(PayoutRequestState.CREATED);
      expect(payoutRequest.requestedBy.id).to.equal(user.id);
    });
  });

  describe('canUpdateStatus', () => {
    const testShouldSucceed = async (id: number, state: PayoutRequestState) => {
      await expect(PayoutRequestService.canUpdateStatus(id, state))
        .to.eventually.be.fulfilled;
    };

    const testShouldFail = async (
      id: number, state: PayoutRequestState, reason: PayoutRequestState,
    ) => {
      await expect(PayoutRequestService.canUpdateStatus(id, state))
        .to.eventually.be.rejectedWith(`status ${reason} already exists.`);
    };

    it('should correctly allow CREATED status', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 0)[0];
      await testShouldSucceed(id, PayoutRequestState.CREATED);
    });

    it('should correctly allow APRROVED status', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[0];
      await testShouldSucceed(id, PayoutRequestState.APPROVED);
    });

    it('should correctly allow DENIED status', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[0];
      await testShouldSucceed(id, PayoutRequestState.DENIED);
    });

    it('should correctly allow CANCELLED status', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[0];
      await testShouldSucceed(id, PayoutRequestState.CANCELLED);
    });

    it('should not allow APPROVED status if DENIED exists', async () => {
      const failState = PayoutRequestState.DENIED;
      const { id } = ctx.payoutRequests
        .filter((req) => req.payoutRequestStatus.some((s) => s.state === failState))[0];
      await testShouldFail(id, PayoutRequestState.APPROVED, failState);
    });

    it('should not allow APPROVED status if CANCELLED exists', async () => {
      const failState = PayoutRequestState.CANCELLED;
      const { id } = ctx.payoutRequests
        .filter((req) => req.payoutRequestStatus.some((s) => s.state === failState))[0];
      await testShouldFail(id, PayoutRequestState.APPROVED, failState);
    });

    it('should not allow DENIED status if APPROVED exists', async () => {
      const failState = PayoutRequestState.APPROVED;
      const { id } = ctx.payoutRequests
        .filter((req) => req.payoutRequestStatus.some((s) => s.state === failState))[0];
      await testShouldFail(id, PayoutRequestState.DENIED, failState);
    });

    it('should not allow DENIED status if CANCELLED exists', async () => {
      const failState = PayoutRequestState.CANCELLED;
      const { id } = ctx.payoutRequests
        .filter((req) => req.payoutRequestStatus.some((s) => s.state === failState))[0];
      await testShouldFail(id, PayoutRequestState.DENIED, failState);
    });

    it('should not allow CANCELLED status if APPROVED exists', async () => {
      const failState = PayoutRequestState.APPROVED;
      const { id } = ctx.payoutRequests
        .filter((req) => req.payoutRequestStatus.some((s) => s.state === failState))[0];
      await testShouldFail(id, PayoutRequestState.CANCELLED, failState);
    });

    it('should not allow CANCELLED status if DENIED exists', async () => {
      const failState = PayoutRequestState.DENIED;
      const { id } = ctx.payoutRequests
        .filter((req) => req.payoutRequestStatus.some((s) => s.state === failState))[0];
      await testShouldFail(id, PayoutRequestState.CANCELLED, failState);
    });

    it('should not allow duplicate statusses', async () => {
      const states = Object.keys(PayoutRequestState);
      await Promise.all(states.map((state) => {
        const { id } = ctx.payoutRequests
          .filter((req) => req.payoutRequestStatus.some((s) => s.state === state))[0];
        return testShouldFail(
          id, state as PayoutRequestState, state as PayoutRequestState,
        );
      }));
    });
  });

  describe('updateStatus', () => {
    it('should correctly update status to CREATED', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 0)[3];
      const user = ctx.users[1];

      const payoutRequest = await PayoutRequestService
        .updateStatus(id, PayoutRequestState.CREATED, user);
      expect(payoutRequest.status.length).to.equal(1);
      expect(payoutRequest.status[0].state).to.equal(PayoutRequestState.CREATED);
      expect(payoutRequest.approvedBy).to.be.undefined;
    });

    it('should correctly update status to CANCELLED', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[3];
      const user = ctx.users[1];

      const payoutRequest = await PayoutRequestService
        .updateStatus(id, PayoutRequestState.CANCELLED, user);
      expect(payoutRequest.status.length).to.equal(2);
      expect(payoutRequest.status[1].state).to.equal(PayoutRequestState.CANCELLED);
      expect(payoutRequest.approvedBy).to.be.undefined;
    });

    it('should correctly update status to DENIED', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[4];
      const user = ctx.users[1];

      const payoutRequest = await PayoutRequestService
        .updateStatus(id, PayoutRequestState.DENIED, user);
      expect(payoutRequest.status.length).to.equal(2);
      expect(payoutRequest.status[1].state).to.equal(PayoutRequestState.DENIED);
      expect(payoutRequest.approvedBy).to.be.undefined;
    });

    it('should correctly update status to APPROVED', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[5];
      const user = ctx.users[1];

      const payoutRequest = await PayoutRequestService
        .updateStatus(id, PayoutRequestState.APPROVED, user);
      expect(payoutRequest.status.length).to.equal(2);
      expect(payoutRequest.status[1].state).to.equal(PayoutRequestState.APPROVED);
      expect(payoutRequest.approvedBy).to.not.be.undefined;
      expect(payoutRequest.approvedBy.id).to.equal(user.id);

      const payoutRequestRaw = await PayoutRequest.findOne(payoutRequest.id, {
        relations: ['transfer'],
      });
      expect(payoutRequestRaw.transfer).to.not.be.undefined;
    });

    it('should throw error if cannot update to status', async () => {
      const { id } = ctx.payoutRequests.filter((req) => req.payoutRequestStatus.length === 1)[5];
      const user = ctx.users[1];

      await expect(PayoutRequestService.updateStatus(id, PayoutRequestState.CREATED, user))
        .to.eventually.be.rejectedWith(`status ${PayoutRequestState.CREATED} already exists`);
    });

    it('should throw error if payout request does not exist', async () => {
      let { id } = ctx.payoutRequests[ctx.payoutRequests.length - 1];
      id += 3900;
      const user = ctx.users[1];

      await expect(PayoutRequestService.updateStatus(id, PayoutRequestState.CREATED, user))
        .to.eventually.be.rejectedWith(`PayoutRequest with ID ${id} does not exist`);
    });
  });
});
