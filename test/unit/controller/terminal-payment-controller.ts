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

import { json } from 'body-parser';
import chai from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import sinon from 'sinon';
import TokenHandler from '../../../src/authentication/token-handler';
import TerminalPaymentController from '../../../src/controller/terminal-payment-controller';
import Database from '../../../src/database/database';
import TerminalPayment from '../../../src/entity/transactions/terminal/terminal-payment';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { ensureProductionRoles, signTokenFor } from '../../helpers/user-factory';
import TerminalPaymentSeeder from '../../seed/ledger/terminal-payment-seeder';

const { expect, request } = chai;

describe('TerminalPaymentController', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: TerminalPaymentController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    terminalPayments: TerminalPayment[],
  };

  const stubs: sinon.SinonStub[] = [];

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    const { terminalPayments } = await new TerminalPaymentSeeder().seed([adminUser, localUser]);

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const app = express();
    const specification = await Swagger.initialize(app);

    await ensureProductionRoles();
    const roleManager = await new RoleManager().initialize();
    const adminToken = await signTokenFor(adminUser, tokenHandler, 'nonce admin');
    const token = await signTokenFor(localUser, tokenHandler);

    const controller = new TerminalPaymentController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/terminal-payments', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      terminalPayments,
    };
  });

  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('POST /terminal-payments', () => {
    it.todo('should create a new terminal payment and return HTTP 200 if admin');
    it.todo('should return HTTP 400 if the request body is invalid');
    it.todo('should return HTTP 403 if the user is not allowed to create a terminal payment');
  });

  describe('GET /terminal-payments/:id', () => {
    it.todo('should return the terminal payment with the given id and HTTP 200');
    it.todo('should return HTTP 404 if the terminal payment does not exist');
    it.todo('should return HTTP 403 if the user is not allowed to view the terminal payment');
  });

  describe('POST /terminal-payments/:id/process', () => {
    it.todo('should start the terminal payment and return HTTP 200 if admin');
    it.todo('should return HTTP 400 if the request body is invalid');
    it.todo('should return HTTP 404 if the terminal payment does not exist');
    it.todo('should return HTTP 403 if the user is not allowed to start the terminal payment');
  });
});
