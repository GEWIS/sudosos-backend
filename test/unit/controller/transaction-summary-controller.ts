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
import { DefaultContext, defaultBefore, finishTestDB } from '../../helpers/test-helpers';
import TransactionSummaryController from '../../../src/controller/transaction-summary-controller';
import { ContainerSeeder, PointOfSaleSeeder, RbacSeeder, TransactionSeeder, UserSeeder } from '../../seed';
import Container from '../../../src/entity/container/container';
import Transaction from '../../../src/entity/transactions/transaction';
import { expect, request } from 'chai';
import User, { UserType } from '../../../src/entity/user/user';
import {
  ContainerSummaryResponse,
} from '../../../src/controller/response/transaction-summary-response';
import { json } from 'body-parser';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import TransactionController from '../../../src/controller/transaction-controller';

describe('TransactionSummaryController', () => {
  let ctx: DefaultContext & {
    controller: TransactionSummaryController,
    admin: User,
    user: User,
    adminToken: string,
    userToken: string,
    containers: Container[],
    transactions: Transaction[],
  };

  before(async () => {
    const d = await defaultBefore();

    const users = await new UserSeeder().seed();
    const { containers, containerRevisions } = await new ContainerSeeder().seed(users);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions);

    const all = { all: new Set<string>(['*']) };
    const roles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        Transaction: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (usr: User) => usr.type === UserType.LOCAL_ADMIN,
    }]);
    await d.roleManager.initialize();

    const admin = users.find((u) => u.type === UserType.LOCAL_ADMIN);
    const user = users.find((u) => u.type === UserType.LOCAL_USER);
    const adminToken = await d.tokenHandler.signToken(await new RbacSeeder().getToken(admin, roles), 'nonce admin');
    const userToken = await d.tokenHandler.signToken(await new RbacSeeder().getToken(user, roles), 'nonce user');

    const controller = new TransactionSummaryController({ specification: d.specification, roleManager: d.roleManager });
    const transactionController = new TransactionController({ specification: d.specification, roleManager: d.roleManager });
    d.app.use(json());
    d.app.use(new TokenMiddleware({ tokenHandler: d.tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    d.app.use('/transactions/summary', controller.getRouter());
    d.app.use('/transactions', transactionController.getRouter());

    ctx = {
      ...d,
      controller,
      admin,
      user,
      adminToken,
      userToken,
      containers,
      transactions,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /transactions/summary/container/:id', () => {
    it('should correctly return response', async () => {
      const container = ctx.containers[0];
      const res = await request(ctx.app)
        .get(`/transactions/summary/container/${container.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('Array<ContainerSummaryResponse>', res.body, false, true);
      expect(validation.valid).to.be.true;

      const seenUsers = new Set<number>();
      const body = res.body as ContainerSummaryResponse;
      body.summaries.forEach((summary) => {
        expect(summary.containerId).to.equal(container.id);
        seenUsers.add(summary.user.id);
      });

      expect(seenUsers.size).to.equal(body.summaries.length);
    });

    it('should return 404 if container does not exist', async () => {
      const containerId = ctx.containers.length + 1;
      const res = await request(ctx.app)
        .get(`/transactions/summary/container/${containerId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Container not found.');
    });

    it('should return 403 if not admin', async () => {
      const container = ctx.containers[0];
      const res = await request(ctx.app)
        .get(`/transactions/summary/container/${container.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(403);
    });
  });
});
