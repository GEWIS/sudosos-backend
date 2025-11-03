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
import TransactionController from '../../src/controller/transaction-controller';
import Database from '../../src/database/database';
import Swagger from '../../src/start/swagger';
import TokenHandler from '../../src/authentication/token-handler';
import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import TokenMiddleware from '../../src/middleware/token-middleware';
import RoleManager from '../../src/rbac/role-manager';
import { TransactionRequest } from '../../src/controller/request/transaction-request';
import { UserFactory } from '../helpers/user-factory';
import ServerSettingsStore from '../../src/server-settings/server-settings-store';
import { truncateAllTables } from '../setup';
import { finishTestDB } from '../helpers/test-helpers';
import { RbacSeeder } from '../seed';
import AuthenticationController from '../../src/controller/authentication-controller';
import AuthenticationService from '../../src/service/authentication-service';
import PinAuthenticator from '../../src/entity/authenticator/pin-authenticator';
import NfcAuthenticator from '../../src/entity/authenticator/nfc-authenticator';
import PointOfSale from '../../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';
import Container from '../../src/entity/container/container';
import ContainerRevision from '../../src/entity/container/container-revision';
import Product from '../../src/entity/product/product';
import ProductRevision from '../../src/entity/product/product-revision';
import { ProductSeeder, ContainerSeeder, PointOfSaleSeeder, VatGroupSeeder, ProductCategorySeeder } from '../seed';

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
    pointOfSaleRevision: PointOfSaleRevision,
    container: Container,
    containerRevision: ContainerRevision,
    product: Product,
    productRevision: ProductRevision,
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
      pointOfSaleRevision: {} as PointOfSaleRevision,
      container: {} as Container,
      containerRevision: {} as ContainerRevision,
      product: {} as Product,
      productRevision: {} as ProductRevision,
    };

    // Truncate all tables first (don't use seedDatabase() as we seed manually)
    await truncateAllTables(ctx.connection);

    // Initialize ServerSettingsStore
    await ServerSettingsStore.getInstance().initialize();

    // Create users
    const userFactory = await UserFactory();
    ctx.users = await userFactory.clone(7);

    // Create a LOCAL_ADMIN user for owning products/POS
    const adminOwner = Object.assign(new User(), {
      firstName: 'Admin Owner',
      lastName: 'User',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
      canGoIntoDebt: true,
    } as User);
    await adminOwner.save();

    ctx.users[0].type = UserType.LOCAL_USER;
    ctx.users[0].acceptedToS = TermsOfServiceStatus.ACCEPTED;
    await ctx.users[0].save();

    // Create roles
    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const rbacSeeder = new RbacSeeder();
    const roles = await rbacSeeder.seed([{
      name: 'Admin',
      permissions: {
        Transaction: {
          create: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN || user.id === ctx.users[0].id,
    }, {
      name: 'Buyer',
      permissions: {
        Transaction: {
          create: own,
        },
      },
      assignmentCheck: async (user: User) => [UserType.LOCAL_USER, UserType.MEMBER].includes(user.type),
    }], ctx.users);

    // Create token handler
    ctx.tokenHandler = new TokenHandler({
      algorithm: 'HS256',
      publicKey: 'test',
      privateKey: 'test',
      expiry: 3600,
    });
    ctx.roleManager = await new RoleManager().initialize();

    // Create tokens
    ctx.adminToken = await ctx.tokenHandler.signToken(await rbacSeeder.getToken(ctx.users[0], roles), '39');
    ctx.userToken = await ctx.tokenHandler.signToken(await rbacSeeder.getToken(ctx.users[1], roles), '39');
    ctx.organMemberToken = await ctx.tokenHandler.signToken(await rbacSeeder.getToken(ctx.users[1], roles, [ctx.users[0]]), '1');

    
    const categories = await new ProductCategorySeeder().seed();
    const vatGroups = await new VatGroupSeeder().seed();
    const { products, productRevisions } = await new ProductSeeder().seed(
      [adminOwner],
      categories,
      vatGroups,
    );
    ctx.product = products[0];
    ctx.productRevision = productRevisions[0];

    const { containers, containerRevisions } = await new ContainerSeeder().seed(
      [adminOwner],
      productRevisions,
    );
    ctx.container = containers[0];
    ctx.containerRevision = containerRevisions[0];

    const { pointsOfSale, pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(
      [adminOwner],
      containerRevisions,
    );
    ctx.pointOfSale = pointsOfSale[0];
    ctx.pointOfSaleRevision = pointOfSaleRevisions[0];

    // Calculate total price
    const rowPrice = ctx.productRevision.priceInclVat.multiply(1);
    const subTransPrice = rowPrice;
    const totalPrice = subTransPrice;

    ctx.validTransReq = {
      from: ctx.users[1].id,
      createdBy: ctx.users[1].id,
      pointOfSale: { id: ctx.pointOfSale.id, revision: ctx.pointOfSaleRevision.revision },
      subTransactions: [{
        container: { id: ctx.container.id, revision: ctx.containerRevision.revision },
        to: adminOwner.id,
        subTransactionRows: [{
          product: { id: ctx.product.id, revision: ctx.productRevision.revision },
          amount: 1,
          totalPriceInclVat: rowPrice.toObject(),
        }],
        totalPriceInclVat: subTransPrice.toObject(),
      }],
      totalPriceInclVat: totalPrice.toObject(),
    };

    // Setup app
    ctx.specification = await Swagger.initialize(ctx.app);
    const transactionController = new TransactionController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    });
    const authController = new AuthenticationController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler);

    ctx.app.use(json());
    ctx.app.use('/authentication', authController.getRouter());
    ctx.app.use(new TokenMiddleware({ tokenHandler: ctx.tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use('/transactions', transactionController.getRouter());
  });

  after(async (): Promise<void> => {
    await finishTestDB(ctx.connection);
  });

  describe('Complete POS Token Flow', () => {
    it('should allow PIN authentication with posId and create transaction', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
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
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
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
      expect(transRes.text).to.equal('Invalid POS token.');
    });

    it('should work in non-strict mode without posId', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
      await pinAuth.save();

      // Set non-strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', false);

      // Authenticate with PIN without posId
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
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

    it('should reject transaction in strict mode without posId', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
      await pinAuth.save();

      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Authenticate with PIN without posId - should fail when strict mode is enabled
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
        });

      expect(authRes.status).to.equal(400);
      expect(authRes.body).to.equal('posId is required when strictPosToken is enabled.');
    });

    it('should reject transaction when NFC posId does not match', async () => {
      // Set up NFC authenticator
      const nfcAuth = new NfcAuthenticator();
      nfcAuth.user = ctx.users[1];
      nfcAuth.nfcCode = 'test-nfc-wrong-pos';
      await nfcAuth.save();

      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Authenticate with NFC and wrong posId
      const authRes = await request(ctx.app)
        .post('/authentication/nfc')
        .send({
          nfcCode: 'test-nfc-wrong-pos',
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
      expect(transRes.text).to.equal('Invalid POS token.');
    });

    it('should allow transaction in non-strict mode with matching posId', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
      await pinAuth.save();

      // Set non-strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', false);

      // Authenticate with PIN and matching posId
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
          posId: ctx.pointOfSale.id,
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

    it('should reject transaction in non-strict mode when posId does not match', async () => {
      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
      await pinAuth.save();

      // Set non-strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', false);

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

      // Try to create a transaction - should fail even in non-strict mode if posId doesn't match
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(403);
      expect(transRes.text).to.equal('Invalid POS token.');
    });

    it('should bypass POS verification for non-lesser tokens', async () => {
      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Use a regular (non-lesser) token - should bypass POS verification
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(200);
    });

    it('should allow transaction in default mode (strictPosToken not set)', async () => {
      // Don't set strictPosToken (should default to false)
      // First ensure it's set to false explicitly or removed
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', false);

      // Set up PIN authenticator
      const pinAuth = new PinAuthenticator();
      pinAuth.user = ctx.users[1];
      pinAuth.hash = await new AuthenticationService().hashPassword('1234');
      await pinAuth.save();

      // Authenticate with PIN without posId
      const authRes = await request(ctx.app)
        .post('/authentication/pin')
        .send({
          userId: ctx.users[1].id,
          pin: '1234',
        });

      expect(authRes.status).to.equal(200);
      expect(authRes.body.token).to.be.a('string');

      // Should work in default (non-strict) mode
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${authRes.body.token}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(200);
    });

    it('should allow transaction with organ member token (non-lesser token)', async () => {
      // Set strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', true);

      // Use organ member token - should bypass POS verification since it's not a lesser token
      const transRes = await request(ctx.app)
        .post('/transactions')
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send(ctx.validTransReq);

      expect(transRes.status).to.equal(200);
    });

    it('should allow NFC authentication in non-strict mode without posId', async () => {
      // Set up NFC authenticator
      const nfcAuth = new NfcAuthenticator();
      nfcAuth.user = ctx.users[1];
      nfcAuth.nfcCode = 'test-nfc-non-strict';
      await nfcAuth.save();

      // Set non-strict mode
      await ServerSettingsStore.getInstance().setSetting('strictPosToken', false);

      // Authenticate with NFC without posId
      const authRes = await request(ctx.app)
        .post('/authentication/nfc')
        .send({
          nfcCode: 'test-nfc-non-strict',
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
  });
});
