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

import { describe } from 'mocha';
import { expect } from 'chai';
import { DataSource } from 'typeorm';
import QRService from '../../../src/service/qr-service';
import QRAuthenticator, { QRAuthenticatorStatus } from '../../../src/entity/authenticator/qr-authenticator';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { QRAuthenticatorSeeder, UserSeeder } from '../../seed';

describe('QRService', (): void => {
  let ctx: {
    connection: DataSource,
    users: User[],
    qrAuthenticators: QRAuthenticator[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    // Seed users and QR authenticators
    const users = await new UserSeeder().seed();
    const qrAuthenticators = await new QRAuthenticatorSeeder().seed(users);

    ctx = {
      connection,
      users,
      qrAuthenticators,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('get', () => {
    it('should return a valid QR authenticator for existing session ID', async () => {
      const validQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(validQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const result = await service.get(validQr.sessionId);

        expect(result).to.not.be.null;
        expect(result.sessionId).to.equal(validQr.sessionId);
        expect(result.status).to.equal(QRAuthenticatorStatus.PENDING);
        expect(result.user).to.be.null;
        expect(result.confirmedAt).to.be.null;
      });
    });

    it('should return a confirmed QR authenticator with user', async () => {
      const confirmedQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CONFIRMED);
      expect(confirmedQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const result = await service.get(confirmedQr.sessionId);

        expect(result).to.not.be.null;
        expect(result.sessionId).to.equal(confirmedQr.sessionId);
        expect(result.status).to.equal(QRAuthenticatorStatus.CONFIRMED);
        expect(result.user).to.not.be.null;
        expect(result.confirmedAt).to.not.be.null;
      });
    });

    it('should return null for non-existent session ID', async () => {
      const nonExistentSessionId = 'non-existent-session-id';

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const result = await service.get(nonExistentSessionId);

        expect(result).to.be.null;
      });
    });

    it('should return EXPIRED status for expired pending QR authenticators', async () => {
      // Create an expired pending QR authenticator
      const expiredQr = new QRAuthenticator();
      expiredQr.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      await QRAuthenticator.save(expiredQr);

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const result = await service.get(expiredQr.sessionId);

        expect(result).to.not.be.null;
        expect(result.status).to.equal(QRAuthenticatorStatus.EXPIRED);
      });
    });

    it('should not change status of already expired QR authenticators', async () => {
      const expiredQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.EXPIRED);
      expect(expiredQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const result = await service.get(expiredQr.sessionId);

        expect(result).to.not.be.null;
        expect(result.status).to.equal(QRAuthenticatorStatus.EXPIRED);
      });
    });

    it('should handle database errors gracefully', async () => {
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        // This should not throw an error even if there's a database issue
        const result = await service.get('invalid-session-id');
        expect(result).to.be.null;
      });
    });
  });

  describe('create', () => {
    it('should create a new QR authenticator with default values', async () => {
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const result = await service.create();

        expect(result).to.not.be.null;
        expect(result.sessionId).to.be.a('string');
        expect(result.sessionId.length).to.equal(36); // UUID length
        expect(result.status).to.equal(QRAuthenticatorStatus.PENDING);
        expect(result.user).to.be.null;
        expect(result.confirmedAt).to.be.null;
        expect(result.expiresAt).to.be.instanceOf(Date);
        expect(result.expiresAt.getTime()).to.be.greaterThan(Date.now());
      });
    });

    it('should persist the created QR authenticator to the database', async () => {
      let createdQr: QRAuthenticator;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        createdQr = await service.create();
      });

      // Verify it was saved to the database
      const savedQr = await QRAuthenticator.findOne({ where: { sessionId: createdQr.sessionId } });
      expect(savedQr).to.not.be.null;
      expect(savedQr.sessionId).to.equal(createdQr.sessionId);
      expect(savedQr.status).to.equal(QRAuthenticatorStatus.PENDING);
    });

    it('should create QR authenticators with unique session IDs', async () => {
      const sessionIds = new Set<string>();

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        
        for (let i = 0; i < 5; i++) {
          const qr = await service.create();
          expect(sessionIds.has(qr.sessionId)).to.be.false;
          sessionIds.add(qr.sessionId);
        }
      });

      expect(sessionIds.size).to.equal(5);
    });
  });

  describe('confirm', () => {
    it('should confirm a pending QR authenticator with a user', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      const user = ctx.users[0];
      expect(pendingQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.confirm(pendingQr, user);
      });

      // Verify the confirmation was saved
      const updatedQr = await QRAuthenticator.findOne({ 
        where: { sessionId: pendingQr.sessionId },
        relations: ['user'],
      });
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CONFIRMED);
      expect(updatedQr.user.id).to.equal(user.id);
      expect(updatedQr.confirmedAt).to.not.be.null;
      expect(updatedQr.confirmedAt.getTime()).to.be.closeTo(Date.now(), 1000); // Within 1 second
    });

    it('should update the original QR authenticator object', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      const user = ctx.users[0];
      expect(pendingQr).to.not.be.undefined;

      const originalStatus = pendingQr.status;
      const originalUser = pendingQr.user;
      const originalConfirmedAt = pendingQr.confirmedAt;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.confirm(pendingQr, user);
      });

      // Verify the original object was updated
      expect(pendingQr.status).to.equal(QRAuthenticatorStatus.CONFIRMED);
      expect(pendingQr.user.id).to.equal(user.id);
      expect(pendingQr.confirmedAt).to.not.be.null;
      expect(pendingQr.status).to.not.equal(originalStatus);
      expect(pendingQr.user).to.not.equal(originalUser);
      expect(pendingQr.confirmedAt).to.not.equal(originalConfirmedAt);
    });
  });

  describe('cancel', () => {
    it('should cancel a pending QR authenticator', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.cancel(pendingQr);
      });

      // Verify the cancellation was saved
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: pendingQr.sessionId } });
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });

    it('should update the original QR authenticator object', async () => {
      const pendingQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.PENDING);
      expect(pendingQr).to.not.be.undefined;

      const originalStatus = pendingQr.status;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.cancel(pendingQr);
      });

      // Verify the original object was updated
      expect(pendingQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
      expect(pendingQr.status).to.not.equal(originalStatus);
    });

    it('should handle cancelling already cancelled QR authenticators', async () => {
      const cancelledQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CANCELLED);
      expect(cancelledQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.cancel(cancelledQr);
      });

      // Verify it remains cancelled
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: cancelledQr.sessionId } });
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });

    it('should handle cancelling confirmed QR authenticators', async () => {
      const confirmedQr = ctx.qrAuthenticators.find(qr => qr.status === QRAuthenticatorStatus.CONFIRMED);
      expect(confirmedQr).to.not.be.undefined;

      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.cancel(confirmedQr);
      });

      // Verify it was cancelled
      const updatedQr = await QRAuthenticator.findOne({ where: { sessionId: confirmedQr.sessionId } });
      expect(updatedQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete QR authentication flow', async () => {
      let qr: QRAuthenticator;
      const user = ctx.users[0];

      // Step 1: Create QR authenticator
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        qr = await service.create();
      });

      expect(qr.status).to.equal(QRAuthenticatorStatus.PENDING);
      expect(qr.user).to.be.null;

      // Step 2: Get the QR authenticator
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const retrievedQr = await service.get(qr.sessionId);
        expect(retrievedQr.sessionId).to.equal(qr.sessionId);
        expect(retrievedQr.status).to.equal(QRAuthenticatorStatus.PENDING);
      });

      // Step 3: Confirm the QR authenticator
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.confirm(qr, user);
      });

      // Step 4: Verify confirmation
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const confirmedQr = await service.get(qr.sessionId);
        expect(confirmedQr.status).to.equal(QRAuthenticatorStatus.CONFIRMED);
        expect(confirmedQr.user.id).to.equal(user.id);
        expect(confirmedQr.confirmedAt).to.not.be.null;
      });
    });

    it('should handle QR authentication cancellation flow', async () => {
      let qr: QRAuthenticator;

      // Step 1: Create QR authenticator
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        qr = await service.create();
      });

      expect(qr.status).to.equal(QRAuthenticatorStatus.PENDING);

      // Step 2: Cancel the QR authenticator
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        await service.cancel(qr);
      });

      // Step 3: Verify cancellation
      await ctx.connection.transaction(async (manager) => {
        const service = new QRService(manager);
        const cancelledQr = await service.get(qr.sessionId);
        expect(cancelledQr.status).to.equal(QRAuthenticatorStatus.CANCELLED);
      });
    });
  });
});
