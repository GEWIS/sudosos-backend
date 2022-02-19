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

describe('PayoutRequestService', () => {
  let ctx: {
    connection: Connection,
    users: User[],
    payoutRequests: PayoutRequest[],
    dineroTransformer: DineroTransformer,
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const payoutRequests = await seedPayoutRequests(users);

    const dineroTransformer = DineroTransformer.Instance;

    ctx = {
      connection,
      users,
      payoutRequests,
      dineroTransformer,
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

    it('should return all payout requests with APPROVED or DENIED status', async () => {
      await testPayoutRequestsWithState([PayoutRequestState.APPROVED, PayoutRequestState.DENIED]);
    });
  });
});
