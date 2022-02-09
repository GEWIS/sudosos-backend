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
    it('Should return all payout requests', async () => {
      const { records } = await PayoutRequestService.getPayoutRequests({});

      expect(records.length).to.equal(ctx.payoutRequests.length);

      const ids = ctx.payoutRequests.map((req) => req.id);
      records.forEach((req) => {
        expect(ids).to.include(req.id);
      });
    });
  });
});
