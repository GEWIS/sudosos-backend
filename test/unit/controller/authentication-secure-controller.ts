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
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import TokenHandler from '../../../src/authentication/token-handler';
import AuthenticationSecureController from '../../../src/controller/authentication-secure-controller';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import OrganMembership from '../../../src/entity/organ/organ-membership';
import AuthenticationResponse from '../../../src/controller/response/authentication-response';
import DefaultRoles from '../../../src/rbac/default-roles';
import settingDefaults from '../../../src/server-settings/setting-defaults';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import { PointOfSaleSeeder, RbacSeeder, UserSeeder, QRAuthenticatorSeeder } from '../../seed';
import QRAuthenticator, { QRAuthenticatorStatus } from '../../../src/entity/authenticator/qr-authenticator';
import WebSocketService from '../../../src/service/websocket-service';
import QRService from '../../../src/service/qr-service';
import AuthenticationService from '../../../src/service/authentication-service';
import { UserResponse } from '../../../src/controller/response/user-response';
import { TermsOfServiceStatus } from '../../../src/entity/user/user';
import sinon from 'sinon';
import AuthenticationSecurePinRequest from '../../../src/controller/request/authentication-secure-pin-request';
import AuthenticationSecureNfcRequest from '../../../src/controller/request/authentication-secure-nfc-request';
import PinAuthenticator from '../../../src/entity/authenticator/pin-authenticator';
import NfcAuthenticator from '../../../src/entity/authenticator/nfc-authenticator';

describe('AuthenticationSecureController', () => {
  let ctx: {
    connection: DataSource,
    app: Application,
    tokenHandler: TokenHandler,
    specification: SwaggerSpecification,
    controller: AuthenticationSecureController,
    users: User[],
    memberAuthenticators: OrganMembership[],
    adminUser: User,
    adminToken: string,
    memberUser: User,
    userToken: string,
    organUser: User,
    pointOfSaleUsers: User[],
    pointsOfSale: PointOfSale[],
    qrAuthenticators: QRAuthenticator[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    await ServerSettingsStore.getInstance().initialize();

    const userSeeder = new UserSeeder();
    const users = await userSeeder.seed();
    const memberAuthenticators = await userSeeder.seedMemberAuthenticators(
      users.filter((u) => u.type !== UserType.ORGAN),
      users.filter((u) => u.type === UserType.ORGAN),
    );

    const { pointsOfSale, pointOfSaleUsers } = await new PointOfSaleSeeder().seed(users);
    const qrAuthenticators = await new QRAuthenticatorSeeder().seed(users);

    await DefaultRoles.synchronize();
    const roleManager = new RoleManager();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminUser = users.find((u) => u.type === UserType.LOCAL_ADMIN);
    const memberUser = users.find((u) => u.type === UserType.MEMBER);
    const organUser = users.find((u) => u.type === UserType.ORGAN);
    const adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(adminUser), 'nonce');
    const userToken = await tokenHandler.signToken(await new RbacSeeder().getToken(memberUser, [], [organUser]), 'nonce');

    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new AuthenticationSecureController(
      { specification, roleManager }, tokenHandler,
    );
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/authentication', controller.getRouter());

    ctx = {
      connection,
      app,
      tokenHandler,
      specification,
      controller,
      users,
      adminUser,
      adminToken,
      memberUser,
      userToken,
      organUser,
      memberAuthenticators,
      pointsOfSale,
      pointOfSaleUsers,
      qrAuthenticators,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /authentication/refreshToken', () => {
    it('should return new token', async () => {
      const res = await request(ctx.app)
        .get('/authentication/refreshToken')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
  });

  describe( 'GET /authentication/pointofsale/{id}', () => {
    it('should return a token for a point of sale if admin', async () => {
      // Admin does not own the POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id !== ctx.adminUser.id);
      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as AuthenticationResponse;
      expect(body.user.id).to.equal(pos.user.id);
      expect(body.rolesWithPermissions.some((r) => r.name === 'Point of Sale')).to.be.true;

      // JWT should have longer expiry compare to standard JWT tokens
      const payload = await ctx.tokenHandler.verifyToken(body.token);
      expect(payload.exp - payload.iat).to.equal(settingDefaults.jwtExpiryPointOfSale);
    });
    it('should return a token for a point of sale if owner', async () => {
      // User owns the POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id === ctx.memberUser.id);
      expect(pos).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as AuthenticationResponse;
      expect(body.user.id).to.equal(pos.user.id);
      expect(body.rolesWithPermissions.some((r) => r.name === 'Point of Sale')).to.be.true;
    });
    it('should return a token for a point of sale if part of organ', async () => {
      // User part of the organ of POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id === ctx.organUser.id);
      expect(pos).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const body = res.body as AuthenticationResponse;
      expect(body.user.id).to.equal(pos.user.id);
      expect(body.rolesWithPermissions.some((r) => r.name === 'Point of Sale')).to.be.true;
    });
    it('should return an HTTP 404 if POS is soft deleted', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.deletedAt != null);
      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of sale not found.');
    });
    it('should return an HTTP 404 if POS does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${ctx.pointsOfSale.length + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Point of sale not found.');
    });
    it('should return an HTTP 403 if user cannot access POS', async () => {
      // User part of the organ of POS
      const pos = ctx.pointsOfSale.find((p) => p.owner.id !== ctx.organUser.id);
      expect(pos).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/pointofsale/${pos.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('POST /authentication/qr/{sessionId}/confirm', () => {
    let qrServiceStub: sinon.SinonStubbedInstance<QRService>;
    let authenticationServiceStub: sinon.SinonStubbedInstance<AuthenticationService>;
    let mockSocketIO: any;
    let mockToMethod: sinon.SinonStub;
    let mockEmitMethod: sinon.SinonStub;

    beforeEach(() => {
      // Create comprehensive WebSocket mocking
      mockEmitMethod = sinon.stub();
      mockToMethod = sinon.stub().returns({
        emit: mockEmitMethod,
      });

      mockSocketIO = {
        to: mockToMethod,
        sockets: {
          in: sinon.stub().returns({
            emit: sinon.stub(),
          }),
        },
        on: sinon.stub(),
      };

      // Mock the WebSocketService.io property
      sinon.stub(WebSocketService, 'io').value(mockSocketIO);

      // Setup service stubs
      qrServiceStub = sinon.createStubInstance(QRService);
      authenticationServiceStub = sinon.createStubInstance(AuthenticationService);

      // Stub the service constructors
      sinon.stub(QRService.prototype, 'get').callsFake(qrServiceStub.get);
      sinon.stub(QRService.prototype, 'confirm').callsFake(qrServiceStub.confirm);
      sinon.stub(AuthenticationService.prototype, 'getSaltedToken').callsFake(authenticationServiceStub.getSaltedToken);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should successfully confirm a pending QR session', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const mockUserResponse: UserResponse = {
        id: ctx.memberUser.id,
        firstName: ctx.memberUser.firstName,
        lastName: ctx.memberUser.lastName,
        active: ctx.memberUser.active,
        deleted: ctx.memberUser.deleted,
        type: ctx.memberUser.type,
        canGoIntoDebt: ctx.memberUser.canGoIntoDebt,
        acceptedToS: ctx.memberUser.acceptedToS,
      };

      const mockToken: AuthenticationResponse = {
        token: 'mock-jwt-token',
        user: mockUserResponse,
        roles: [],
        organs: [],
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        rolesWithPermissions: [],
      };

      // Setup stubs
      qrServiceStub.get.resolves(pendingQr);
      qrServiceStub.confirm.resolves();
      authenticationServiceStub.getSaltedToken.resolves(mockToken);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ message: 'QR code confirmed successfully.' });

      // Verify service calls
      expect(qrServiceStub.get.calledOnceWith(pendingQr.sessionId)).to.be.true;
      expect(qrServiceStub.confirm.calledWithMatch(pendingQr, sinon.match({ id: ctx.memberUser.id }))).to.be.true;
      expect(authenticationServiceStub.getSaltedToken.calledOnce).to.be.true;

      // Verify WebSocket emission through mocked Socket.IO
      expect(mockToMethod.calledOnceWith(`qr-session-${pendingQr.sessionId}`)).to.be.true;
      expect(mockEmitMethod.calledOnceWith('qr-confirmed', {
        sessionId: pendingQr.sessionId,
        token: mockToken,
      })).to.be.true;
    });

    it('should return 404 for non-existent session', async () => {
      const nonExistentSessionId = '00000000-0000-0000-0000-000000000000';
      qrServiceStub.get.resolves(null);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${nonExistentSessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Session not found.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should return 410 for expired session', async () => {
      const expiredQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.EXPIRED);
      expect(expiredQr).to.not.be.undefined;

      qrServiceStub.get.resolves(expiredQr);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${expiredQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(410);
      expect(res.body).to.equal('Session has expired.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should return 400 for already confirmed session', async () => {
      const confirmedQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CONFIRMED);
      expect(confirmedQr).to.not.be.undefined;

      qrServiceStub.get.resolves(confirmedQr);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${confirmedQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Session is no longer pending.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should return 400 for cancelled session', async () => {
      const cancelledQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CANCELLED);
      expect(cancelledQr).to.not.be.undefined;

      qrServiceStub.get.resolves(cancelledQr);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${cancelledQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Session is no longer pending.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should return 500 on QR service error', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      qrServiceStub.get.rejects(new Error('Database error'));

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should return 500 on authentication service error', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      qrServiceStub.get.resolves(pendingQr);
      authenticationServiceStub.getSaltedToken.rejects(new Error('Token generation error'));

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should return 500 on QR confirm service error', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      const mockUserResponse: UserResponse = {
        id: ctx.memberUser.id,
        firstName: ctx.memberUser.firstName,
        lastName: ctx.memberUser.lastName,
        active: ctx.memberUser.active,
        deleted: ctx.memberUser.deleted,
        type: ctx.memberUser.type,
        canGoIntoDebt: ctx.memberUser.canGoIntoDebt,
        acceptedToS: ctx.memberUser.acceptedToS,
      };

      const mockToken: AuthenticationResponse = {
        token: 'mock-jwt-token',
        user: mockUserResponse,
        roles: [],
        organs: [],
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        rolesWithPermissions: [],
      };

      qrServiceStub.get.resolves(pendingQr);
      authenticationServiceStub.getSaltedToken.resolves(mockToken);
      qrServiceStub.confirm.rejects(new Error('Database save error'));

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      // Verify no WebSocket emission
      expect(mockToMethod.called).to.be.false;
      expect(mockEmitMethod.called).to.be.false;
    });

    it('should work with admin user', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const mockUserResponse: UserResponse = {
        id: ctx.adminUser.id,
        firstName: ctx.adminUser.firstName,
        lastName: ctx.adminUser.lastName,
        active: ctx.adminUser.active,
        deleted: ctx.adminUser.deleted,
        type: ctx.adminUser.type,
        canGoIntoDebt: ctx.adminUser.canGoIntoDebt,
        acceptedToS: ctx.adminUser.acceptedToS,
      };

      const mockToken: AuthenticationResponse = {
        token: 'mock-jwt-token',
        user: mockUserResponse,
        roles: [],
        organs: [],
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        rolesWithPermissions: [],
      };

      qrServiceStub.get.resolves(pendingQr);
      qrServiceStub.confirm.resolves();
      authenticationServiceStub.getSaltedToken.resolves(mockToken);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ message: 'QR code confirmed successfully.' });

      // Verify WebSocket emission with admin user
      expect(mockToMethod.calledOnceWith(`qr-session-${pendingQr.sessionId}`)).to.be.true;
      expect(mockEmitMethod.calledOnceWith('qr-confirmed', {
        sessionId: pendingQr.sessionId,
        token: mockToken,
      })).to.be.true;
    });

    it('should handle WebSocket emission error gracefully', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const mockUserResponse: UserResponse = {
        id: ctx.memberUser.id,
        firstName: ctx.memberUser.firstName,
        lastName: ctx.memberUser.lastName,
        active: ctx.memberUser.active,
        deleted: ctx.memberUser.deleted,
        type: ctx.memberUser.type,
        canGoIntoDebt: ctx.memberUser.canGoIntoDebt,
        acceptedToS: ctx.memberUser.acceptedToS,
      };

      const mockToken: AuthenticationResponse = {
        token: 'mock-jwt-token',
        user: mockUserResponse,
        roles: [],
        organs: [],
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        rolesWithPermissions: [],
      };

      qrServiceStub.get.resolves(pendingQr);
      qrServiceStub.confirm.resolves();
      authenticationServiceStub.getSaltedToken.resolves(mockToken);

      // Make WebSocket emission throw an error
      mockEmitMethod.throws(new Error('WebSocket error'));

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');
    });

    it('should verify correct token parameters passed to authentication service', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const mockUserResponse: UserResponse = {
        id: ctx.memberUser.id,
        firstName: ctx.memberUser.firstName,
        lastName: ctx.memberUser.lastName,
        active: ctx.memberUser.active,
        deleted: ctx.memberUser.deleted,
        type: ctx.memberUser.type,
        canGoIntoDebt: ctx.memberUser.canGoIntoDebt,
        acceptedToS: ctx.memberUser.acceptedToS,
      };

      const mockToken: AuthenticationResponse = {
        token: 'mock-jwt-token',
        user: mockUserResponse,
        roles: [],
        organs: [],
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        rolesWithPermissions: [],
      };

      qrServiceStub.get.resolves(pendingQr);
      qrServiceStub.confirm.resolves();
      authenticationServiceStub.getSaltedToken.resolves(mockToken);

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/confirm`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);

      // Verify authentication service was called with correct parameters
      expect(authenticationServiceStub.getSaltedToken.calledOnce).to.be.true;
      const params = authenticationServiceStub.getSaltedToken.getCall(0).args[0];
      expect(params.user.id).to.equal(ctx.memberUser.id);
      expect(params.context.roleManager).to.be.an('object');
      expect(params.context.tokenHandler).to.equal(ctx.tokenHandler);
    });

    it('should test WebSocketService.emitQRConfirmed method directly', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const mockUserResponse: UserResponse = {
        id: ctx.memberUser.id,
        firstName: ctx.memberUser.firstName,
        lastName: ctx.memberUser.lastName,
        active: ctx.memberUser.active,
        deleted: ctx.memberUser.deleted,
        type: ctx.memberUser.type,
        canGoIntoDebt: ctx.memberUser.canGoIntoDebt,
        acceptedToS: ctx.memberUser.acceptedToS,
      };

      const mockToken: AuthenticationResponse = {
        token: 'mock-jwt-token',
        user: mockUserResponse,
        roles: [],
        organs: [],
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        rolesWithPermissions: [],
      };

      // Call WebSocketService.emitQRConfirmed directly
      WebSocketService.emitQRConfirmed(pendingQr, mockToken);

      // Verify the WebSocket methods were called correctly
      expect(mockToMethod.calledOnceWith(`qr-session-${pendingQr.sessionId}`)).to.be.true;
      expect(mockEmitMethod.calledOnceWith('qr-confirmed', {
        sessionId: pendingQr.sessionId,
        token: mockToken,
      })).to.be.true;
    });
  });

  describe('POST /authentication/pin-secure', () => {
    let posUserToken: string;
    let memberUserWithPin: User;

    before(async () => {
      // Set up PIN authenticator for a member user
      memberUserWithPin = ctx.users.find((u) => u.type === UserType.MEMBER && u.id !== ctx.memberUser.id) || ctx.memberUser;
      await new AuthenticationService().setUserAuthenticationHash(memberUserWithPin, '1234', PinAuthenticator);

      // Create token for POS user
      const posUser = ctx.pointOfSaleUsers[0];
      posUserToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(posUser), 'nonce');
    });

    const validSecurePinRequest: AuthenticationSecurePinRequest = {
      userId: 0, // Will be set in tests
      pin: '1234',
      posId: 0, // Will be set to actual POS ID in tests
    };

    it('should return HTTP 200 and token when valid POS user authenticates with correct PIN', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecurePinRequest,
        userId: memberUserWithPin.id,
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/pin-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const auth = res.body as AuthenticationResponse;
      expect(auth.user.id).to.equal(memberUserWithPin.id);
      expect(auth.token).to.be.a('string');

      // Verify the token contains posId
      const decoded = await ctx.tokenHandler.verifyToken(auth.token);
      expect(decoded.posId).to.equal(pos.id);
    });

    it('should return HTTP 403 when caller is not a POS user', async () => {
      const pos = ctx.pointsOfSale[0];
      const requestBody = {
        ...validSecurePinRequest,
        userId: memberUserWithPin.id,
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/pin-secure')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body).to.equal('Only POS users can use secure PIN authentication.');
    });

    it('should return HTTP 403 when POS user ID does not match requested posId', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecurePinRequest,
        userId: memberUserWithPin.id,
        posId: pos.id + 999, // Wrong POS ID
      };

      const res = await request(ctx.app)
        .post('/authentication/pin-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body).to.equal('POS user ID does not match the requested posId.');
    });

    it('should return HTTP 403 when user does not exist', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecurePinRequest,
        userId: 99999, // Non-existent user ID
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/pin-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });

    it('should return HTTP 403 when PIN is incorrect', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecurePinRequest,
        userId: memberUserWithPin.id,
        pin: '9999', // Wrong PIN
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/pin-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });

    it('should return HTTP 403 when user does not have a PIN authenticator', async () => {
      // Find a user without PIN
      const userWithoutPin = ctx.users.find((u) => {
        return u.type === UserType.MEMBER && u.id !== memberUserWithPin.id;
      });
      expect(userWithoutPin).to.not.be.undefined;

      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecurePinRequest,
        userId: userWithoutPin.id,
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/pin-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });

  describe('POST /authentication/nfc-secure', () => {
    let posUserToken: string;
    let memberUserWithNfc: User;

    before(async () => {
      // Set up NFC authenticator for a member user
      memberUserWithNfc = ctx.users.find((u) => u.type === UserType.MEMBER && u.id !== ctx.memberUser.id) || ctx.memberUser;
      const nfcAuth = new NfcAuthenticator();
      nfcAuth.user = memberUserWithNfc;
      nfcAuth.nfcCode = 'secure-nfc-code-1234';
      await nfcAuth.save();

      // Create token for POS user
      const posUser = ctx.pointOfSaleUsers[0];
      posUserToken = await ctx.tokenHandler.signToken(await new RbacSeeder().getToken(posUser), 'nonce');
    });

    const validSecureNfcRequest: AuthenticationSecureNfcRequest = {
      nfcCode: 'secure-nfc-code-1234',
      posId: 0, // Will be set to actual POS ID in tests
    };

    it('should return HTTP 200 and token when valid POS user authenticates with correct NFC', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecureNfcRequest,
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/nfc-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const auth = res.body as AuthenticationResponse;
      expect(auth.user.id).to.equal(memberUserWithNfc.id);
      expect(auth.token).to.be.a('string');

      // Verify the token contains posId
      const decoded = await ctx.tokenHandler.verifyToken(auth.token);
      expect(decoded.posId).to.equal(pos.id);
    });

    it('should return HTTP 403 when caller is not a POS user', async () => {
      const pos = ctx.pointsOfSale[0];
      const requestBody = {
        ...validSecureNfcRequest,
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/nfc-secure')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body).to.equal('Only POS users can use secure NFC authentication.');
    });

    it('should return HTTP 403 when POS user ID does not match requested posId', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        ...validSecureNfcRequest,
        posId: pos.id + 999, // Wrong POS ID
      };

      const res = await request(ctx.app)
        .post('/authentication/nfc-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body).to.equal('POS user ID does not match the requested posId.');
    });

    it('should return HTTP 403 when NFC code does not exist', async () => {
      const pos = ctx.pointsOfSale.find((p) => p.user.id === ctx.pointOfSaleUsers[0].id);
      const requestBody = {
        nfcCode: 'non-existent-nfc-code',
        posId: pos.id,
      };

      const res = await request(ctx.app)
        .post('/authentication/nfc-secure')
        .set('Authorization', `Bearer ${posUserToken}`)
        .send(requestBody);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });
});
