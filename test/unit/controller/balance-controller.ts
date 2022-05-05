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
import express, { Application } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import TokenHandler from '../../../src/authentication/token-handler';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import BalanceController from '../../../src/controller/balance-controller';

describe('BalanceController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BalanceController,
    userToken: string,
    adminToken: string,
    users: User[],
    transactions: Transaction[],
  };

  before(async () => {
    const connection = await Database.initialize();
    const app = express();
    const database = await seedDatabase();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const userToken = await tokenHandler.signToken({ user: database.users[0], roles: ['User'], lesser: false }, '33');
    const adminToken = await tokenHandler.signToken({ user: database.users[6], roles: ['User', 'Admin'], lesser: false }, '33');

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Balance: {
          get: all,
          update: all,
        },

      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    roleManager.registerRole({
      name: 'User',
      permissions: {
        Balance: {
          get: own,
          update: own,
        },

      },
      assignmentCheck: async () => true,
    });

    const specification = await Swagger.initialize(app);
    const controller = new BalanceController({
      specification,
      roleManager,
    });

    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/balances', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      userToken,
      adminToken,
      ...database,
    };
  });

  describe('GET /balances', () => {
    it('should return balance of self', async () => {
      const res = await request(ctx.app)
        .get('/balances')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(Number.parseInt(res.body, 10)).to.not.be.NaN;
    });

    it('should return forbidden when user is not admin', async () => {
      const res = await request(ctx.app)
        .get('/balances/2')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return 200 when user is admin', async () => {
      const res = await request(ctx.app)
        .get('/balances/2')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(Number.parseInt(res.body, 10)).to.not.be.NaN;
    });
  });

  after(async () => {
    await ctx.connection.close();
  });
});
