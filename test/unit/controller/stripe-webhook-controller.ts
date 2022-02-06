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
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import StripeWebhookController from '../../../src/controller/stripe-webhook-controller';

describe('StripeWebhookController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: StripeWebhookController,
  };

  before(async () => {
    const connection = await Database.initialize();

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };

    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        StripeDeposit: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });
    roleManager.registerRole({
      name: 'User',
      permissions: {
        StripeDeposit: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new StripeWebhookController({ specification, roleManager });
    app.use(json());
    app.use('/stripe', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('POST /webhook', () => {
    it('should return 400 when sending no body', async () => {
      const res = await request(ctx.app)
        .post('/stripe/webhook')
        .send({});

      expect(res.status).to.equal(400);
    });
  });
});
