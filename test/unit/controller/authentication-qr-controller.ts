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

import { DefaultContext, defaultContext, finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import QRAuthenticator, { QRAuthenticatorStatus } from '../../../src/entity/authenticator/qr-authenticator';
import { expect, request } from 'chai';
import { QRCodeResponse, QRStatusResponse } from '../../../src/controller/response/authentication-qr-response';
import AuthenticationQRController from '../../../src/controller/authentication-qr-controller';
import { json } from 'body-parser';
import { QRAuthenticatorSeeder } from '../../seed';
import QRService from '../../../src/service/qr-service';
import sinon from 'sinon';

function qrStatusResponseEq(a: QRAuthenticator, b: QRStatusResponse): Boolean {
  return a.status === b.status;
}

describe('AuthenticationQRController', () => {
  let ctx: DefaultContext & {
    qrAuthenticators: QRAuthenticator[];
  };

  before(async () => {
    const c = { ...await defaultContext() };
    await truncateAllTables(c.connection);

    c.app.use(json());
    const controller = new AuthenticationQRController({ specification: c.specification, roleManager: c.roleManager }, c.tokenHandler);
    c.app.use('/authentication/qr', controller.getRouter());

    ctx = { ...c,  qrAuthenticators: await new QRAuthenticatorSeeder().seed() };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('POST /authentication/qr/generate', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .post('/authentication/qr/generate');
      expect(res.status).to.equal(200);
      const validator = ctx.specification.validateModel(
        'QRCodeResponse',
        res.body,
        false,
        true,
      );
      expect(validator.valid).to.be.true;
    });

    it('should generate a new QR code', async () => {
      const res = await request(ctx.app)
        .post('/authentication/qr/generate');
      expect(res.status).to.equal(200);

      const qrResponse = res.body as QRCodeResponse;
      expect(qrResponse.sessionId).to.be.a('string');
      expect(qrResponse.sessionId.length).to.equal(36); // UUID length
      expect(qrResponse.qrCodeUrl).to.be.a('string');
      expect(qrResponse.expiresAt).to.be.a('string');

      // Verify the QR authenticator was created in the database
      const qrAuthenticator = await QRAuthenticator.findOne({ where: { sessionId: qrResponse.sessionId } });
      expect(qrAuthenticator).to.not.be.null;
      expect(qrAuthenticator.status).to.equal(QRAuthenticatorStatus.PENDING);
      expect(qrAuthenticator.user).to.be.null;
      expect(qrAuthenticator.confirmedAt).to.be.null;
      expect(qrAuthenticator.expiresAt.getTime()).to.be.greaterThan(Date.now());
    });

    it('should create QR codes with unique session IDs', async () => {
      const sessionIds = new Set<string>();

      for (let i = 0; i < 3; i++) {
        const res = await request(ctx.app)
          .post('/authentication/qr/generate');
        expect(res.status).to.equal(200);

        const qrResponse = res.body as QRCodeResponse;
        expect(sessionIds.has(qrResponse.sessionId)).to.be.false;
        sessionIds.add(qrResponse.sessionId);
      }

      expect(sessionIds.size).to.equal(3);
    });

    it('should return 500 on service error', async () => {
      const qrServiceStub = sinon.createStubInstance(QRService);
      qrServiceStub.create.rejects(new Error('Database error'));
      sinon.stub(QRService.prototype, 'create').callsFake(qrServiceStub.create);

      const res = await request(ctx.app)
        .post('/authentication/qr/generate');
      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      sinon.restore();
    });
  });

  describe('GET /authentication/qr/{sessionId}/status', () => {
    it('should return correct model', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/qr/${pendingQr.sessionId}/status`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification
        .validateModel('QRStatusResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
    });

    it('should return status for existing session', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/qr/${pendingQr.sessionId}/status`);
      expect(res.status).to.equal(200);

      const statusResponse = res.body as QRStatusResponse;
      expect(statusResponse.status).to.equal(QRAuthenticatorStatus.PENDING);
      expect(qrStatusResponseEq(pendingQr, statusResponse)).to.be.true;
    });

    it('should return status for confirmed session', async () => {
      const confirmedQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CONFIRMED);
      expect(confirmedQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/qr/${confirmedQr.sessionId}/status`);
      expect(res.status).to.equal(200);

      const statusResponse = res.body as QRStatusResponse;
      expect(statusResponse.status).to.equal(QRAuthenticatorStatus.CONFIRMED);
    });

    it('should return status for expired session', async () => {
      const expiredQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.EXPIRED);
      expect(expiredQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/qr/${expiredQr.sessionId}/status`);
      expect(res.status).to.equal(200);

      const statusResponse = res.body as QRStatusResponse;
      expect(statusResponse.status).to.equal(QRAuthenticatorStatus.EXPIRED);
    });

    it('should return status for cancelled session', async () => {
      const cancelledQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CANCELLED);
      expect(cancelledQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .get(`/authentication/qr/${cancelledQr.sessionId}/status`);
      expect(res.status).to.equal(200);

      const statusResponse = res.body as QRStatusResponse;
      expect(statusResponse.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });

    it('should return 404 for non-existent session', async () => {
      const nonExistentSessionId = '00000000-0000-0000-0000-000000000000';
      const res = await request(ctx.app)
        .get(`/authentication/qr/${nonExistentSessionId}/status`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Session not found.');
    });

    it('should return 500 on service error', async () => {
      const qrServiceStub = sinon.createStubInstance(QRService);
      qrServiceStub.get.rejects(new Error('Database error'));
      sinon.stub(QRService.prototype, 'get').callsFake(qrServiceStub.get);

      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      const res = await request(ctx.app)
        .get(`/authentication/qr/${pendingQr.sessionId}/status`);
      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      sinon.restore();
    });
  });

  describe('POST /authentication/qr/{sessionId}/cancel', () => {
    it('should cancel an existing pending session', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/cancel`);
      expect(res.status).to.equal(204);

      // Verify the session was cancelled in the database
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: pendingQr.sessionId } });
      expect(updatedQr).to.not.be.null;
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });

    it('should return 204 for non-existent session', async () => {
      const nonExistentSessionId = '00000000-0000-0000-0000-000000000000';
      const res = await request(ctx.app)
        .post(`/authentication/qr/${nonExistentSessionId}/cancel`);
      expect(res.status).to.equal(204);
    });

    it('should cancel a confirmed session', async () => {
      const confirmedQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CONFIRMED);
      expect(confirmedQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/authentication/qr/${confirmedQr.sessionId}/cancel`);
      expect(res.status).to.equal(204);

      // Verify the session was cancelled in the database
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: confirmedQr.sessionId } });
      expect(updatedQr).to.not.be.null;
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });

    it('should return 204 for already cancelled session', async () => {
      const cancelledQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CANCELLED);
      expect(cancelledQr).to.not.be.undefined;

      const res = await request(ctx.app)
        .post(`/authentication/qr/${cancelledQr.sessionId}/cancel`);
      expect(res.status).to.equal(204);

      // Verify the session remains cancelled
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: cancelledQr.sessionId } });
      expect(updatedQr).to.not.be.null;
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });

    it('should return 500 on service error', async () => {
      const qrServiceStub = sinon.createStubInstance(QRService);
      qrServiceStub.get.rejects(new Error('Database error'));
      sinon.stub(QRService.prototype, 'get').callsFake(qrServiceStub.get);

      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      const res = await request(ctx.app)
        .post(`/authentication/qr/${pendingQr.sessionId}/cancel`);
      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      sinon.restore();
    });
  });

  describe('QR Code URL generation', () => {
    it('should generate correct QR code URL format', async () => {
      const res = await request(ctx.app)
        .post('/authentication/qr/generate');
      expect(res.status).to.equal(200);

      const qrResponse = res.body as QRCodeResponse;
      const expectedUrlPattern = /^https?:\/\/.*\/auth\/qr\/confirm\?sessionId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(qrResponse.qrCodeUrl).to.match(expectedUrlPattern);
      expect(qrResponse.qrCodeUrl).to.include(qrResponse.sessionId);
    });
  });

  describe('Session expiration handling', () => {
    it('should handle expired sessions correctly', async () => {
      // Create an expired QR authenticator
      const expiredQr = new QRAuthenticator();
      expiredQr.status = QRAuthenticatorStatus.PENDING;
      expiredQr.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      await expiredQr.save();

      const res = await request(ctx.app)
        .get(`/authentication/qr/${expiredQr.sessionId}/status`);
      expect(res.status).to.equal(200);

      const statusResponse = res.body as QRStatusResponse;
      expect(statusResponse.status).to.equal(QRAuthenticatorStatus.EXPIRED);

      // Verify it was updated in the database
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: expiredQr.sessionId } });
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.EXPIRED);
    });
  });
});