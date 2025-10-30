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

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import log4js, { Logger } from 'log4js';
import TransactionController from '../../src/controller/transaction-controller';
import Transaction from '../../src/entity/transactions/transaction';
import Database from '../../src/database/database';
import seedDatabase from '../seed';
import Swagger from '../../src/start/swagger';
import TokenHandler from '../../src/authentication/token-handler';
import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import TokenMiddleware from '../../src/middleware/token-middleware';
import RoleManager from '../../src/rbac/role-manager';
import { TransactionRequest } from '../../src/controller/request/transaction-request';
import { inUserContext, UserFactory } from '../helpers/user-factory';
import OrganMembership from '../../src/entity/organ/organ-membership';
import ServerSettingsStore from '../../src/server-settings/server-settings-store';
import { truncateAllTables } from '../setup';
import { finishTestDB } from '../helpers/test-helpers';
import dinero from 'dinero.js';
import { RbacSeeder } from '../seed';
import { SeededRole } from '../seed/rbac-seeder';
import AuthenticationController from '../../src/controller/authentication-controller';
import PinAuthenticator from '../../src/entity/authenticator/pin-authenticator';
import NfcAuthenticator from '../../src/entity/authenticator/nfc-authenticator';
import PointOfSale from '../../src/entity/point-of-sale/point-of-sale';
import Container from '../../src/entity/container/container';
import Product from '../../src/entity/product/product';
import VatGroup from '../../src/entity/vat-group/vat-group';

describe('POS Token Flow Integration Tests', (): void => {
  let ctx: {
    app: Application,
    connection: DataSource,
    specification: SwaggerSpecification,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    users: User[],
    adminToken: string,
    userToken: string,
    organMemberToken: string,
    validTransReq: TransactionRequest,
    pointOfSale: PointOfSale,
    container: Container,
    product: Product,
  };

  before(async (): Promise<void> => {
    ctx = {
      app: express(),
      connection: await Database.initialize(),
      specification: {} as SwaggerSpecification,
      tokenHandler: {} as TokenHandler,
      roleManager: {} as RoleManager,
      users: [],
      adminToken: '',
      userToken: '',
      organMemberToken: '',
      validTransReq: {} as TransactionRequest,
      pointOfSale: {} as PointOfSale,
      container: {} as Container,
      product: {} as Product,
    };

    // Seed database
    await seedDatabase(ctx.connection);

    // Create users
    ctx.users = await UserFactory().clone(7);
    ctx.users[0].type = UserType.LOCAL_USER;
    ctx.users[0].acceptedToS = TermsOfServiceStatus.ACCEPTED;
    await ctx.users[0].save();

    // Create roles
    const roles: SeededRole[] = [
      { name: 'Admin', permissions: [{ entity: 'Transaction', action: 'create', relation: 'all' }] },
      { name: 'Buyer', permissions: [{ entity: 'Transaction', action: 'create', relation: 'own' }] },
    ];
    const rbacSeeder = new RbacSeeder();
    await rbacSeeder.seed(ctx.connection, roles);

    // Create token handler
    ctx.tokenHandler = new TokenHandler('test-secret', 3600);
    ctx.roleManager = new RoleManager(ctx.connection);

    // Create tokens
    ctx.adminToken = await ctx.tokenHandler.signToken(await rbacSeeder.getToken(ctx.users[0], ['Admin']), '39');
    ctx.userToken = await ctx.tokenHandler.signToken(await rbacSeeder.getToken(ctx.users[1], ['Buyer']), '39');
    ctx.organMemberToken = await ctx.tokenHandler.signToken(await rbacSeeder.getToken(ctx.users[1], ['Buyer'], [ctx.users[0]]), '1');

    // Create test data
    const vatGroup = await VatGroup.save({
      name: 'Test VAT',
      percentage: 21,
    });

    ctx.pointOfSale = await PointOfSale.save({
      name: 'Test POS',
      owner: ctx.users[0],
      revision: 1,
    });

    ctx.container = await Container.save({
      name: 'Test Container',
      owner: ctx.users[0],
      pointOfSale: ctx.pointOfSale,
      revision: 1,
    });

    ctx.product = await Product.save({
      name: 'Test Product',
      price: dinero({ amount: 100, currency: 'EUR' }),
      vatGroup,
      owner: ctx.users[0],
      revision: 1,
    });

    ctx.validTransReq = {
      from: ctx.users[1].id,
      to: ctx.users[0].id,
      createdBy: ctx.users[1].id,
      pointOfSale: { id: ctx.pointOfSale.id, revision: ctx.pointOfSale.revision },
      subTransactions: [{
        container: { id: ctx.container.id, revision: ctx.container.revision },
        to: ctx.users[0].id,
        subTransactionRows: [{
          product: { id: ctx.product.id, revision: ctx.product.revision },
          amount: 1,
          price: dinero({ amount: 100, currency: 'EUR' }),
        }],
      }],
    };

    // Setup app
    ctx.specification = await Swagger.initialize(ctx.app);
    const transactionController = new TransactionController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler);
    const authController = new AuthenticationController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler);

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler: ctx.tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/transactions', transactionController.getRouter());
    ctx.app.use('/authentication', authController.getRouter());
  });

  after(async (): Promise<void> => {
    await finishTestDB(ctx.connection);
  });

  afterEach(async (): Promise<void> => {
    await truncateAllTables(ctx.connection);
  });

  describe('Complete POS Token Flow', () => {
    it('should allow PIN authentication with posId and create transaction', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationController({} as any, {} as any).hashPassword('1234');
      await pinAuth.save();

      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Authenticate with PIN and posId
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
          posId: ctx.pointOfSale.id,
        });

      expect(authRes.status).to.equal(200);
      expect(authRes.body.token).to.be.a('string');

      // Use the token to create a transaction
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(200);
    });

    it('should allow NFC authentication with posId and create transaction', async () => {
      // Set up NFC authenticator
      const nfcAuth = new NfcAuthenticator();
      nfcAuth.user = ctx.users[1];
      nfcAuth.nfcCode = 'test-nfc-code';
      await nfcAuth.save();

      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Authenticate with NFC and posId
      const authRes = await request(ctx.app)
        .post('/authentication/nfc')
        .send({
          nfcCode: 'test-nfc-code',
          posId: ctx.pointOfSale.id,
        });

      expect(authRes.status).to.equal(200);
      expect(authRes.body.token).to.be.a('string');

      // Use the token to create a transaction
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(200);
    });

    it('should reject transaction when posId does not match', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationController({} as any, {} as any).hashPassword('1234');
      await pinAuth.save();

      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Authenticate with PIN and wrong posId
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
          posId: 999, // Wrong POS ID
        });

      expect(authRes.status).to.equal(200);
      expect(authRes.body.token).to.be.a('string');

      // Try to create a transaction - should fail
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(403);
      expect(transRes.body).to.equal('Invalid POS token.');
    });

    it('should work in non-strict mode without posId', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationController({} as any, {} as any).hashPassword('1234');
      await pinAuth.save();

      // Set non-strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', false);

      // Authenticate with PIN without posId
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
          // No posId provided
        });

      expect(authRes.status).to.equal(200);
      expect(authRes.body.token).to.be.a('string');

      // Use the token to create a transaction - should work
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(200);
    });

    it('should reject authentication in strict mode without posId', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationController({} as any, {} as any).hashPassword('1234');
      await pinAuth.save();

      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Authenticate with PIN without posId - should work (authentication doesn't check posId)
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
          // No posId provided
        });

      expect(authRes.status).to.equal(200);
      expect(authRes.body.token).to.be.a('string');

      // But creating a transaction should fail
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(403);
      expect(transRes.body).to.equal('Invalid POS token.');
    });
  });
});
