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

import { DataSource } from 'typeorm';
import { expect } from 'chai';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import Database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import User, { LocalUserTypes, UserType } from '../../../src/entity/user/user';
import UserExpiryService from '../../../src/service/user-expiry-service';
import Notifier from '../../../src/notifications';
import { rootStubs } from '../../root-hooks';
import Mailer from '../../../src/mailer';

describe('UserExpiryService', () => {
  let ctx: {
    connection: DataSource;
  };

  let sandbox: SinonSandbox;
  let notifyFake: SinonSpy;

  // Helper to create a user with the given properties and save it.
  async function createUser(overrides: Partial<User> & { type: UserType }): Promise<User> {
    return User.save({
      firstName: 'Test',
      lastName: 'User',
      active: true,
      deleted: false,
      expiryNotificationSent: false,
      email: 'test@example.com',
      ...overrides,
    } as User);
  }

  // Returns a Date offset by the given number of days from now.
  function daysFromNow(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  beforeEach(async () => {
    const connection = await Database.initialize();
    ctx = { connection };

    rootStubs?.mail.restore();
    Mailer.reset();

    sandbox = sinon.createSandbox();
    notifyFake = sandbox.spy();
    sandbox.stub(Notifier, 'getInstance').returns({ notify: notifyFake } as any);
  });

  afterEach(async () => {
    sandbox.restore();
    await finishTestDB(ctx.connection);
  });

  describe('deactivateExpiredUsers', () => {
    it('should deactivate active local users whose expiryDate is in the past', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(-1) });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(result.map((u) => u.id)).to.include(user.id);
      const updated = await User.findOne({ where: { id: user.id } });
      expect(updated.active).to.be.false;
    });

    it('should deactivate all LocalUserTypes, not just LOCAL_USER', async () => {
      const users = await Promise.all(
        LocalUserTypes.map((type) => createUser({ type, expiryDate: daysFromNow(-1) })),
      );

      const result = await new UserExpiryService().deactivateExpiredUsers();
      const resultIds = result.map((u) => u.id);

      for (const user of users) {
        expect(resultIds).to.include(user.id);
      }
    });

    it('should not deactivate users without an expiryDate', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: null });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      const updated = await User.findOne({ where: { id: user.id } });
      expect(updated.active).to.be.true;
    });

    it('should not deactivate users whose expiryDate is in the future', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(10) });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      const updated = await User.findOne({ where: { id: user.id } });
      expect(updated.active).to.be.true;
    });

    it('should not deactivate already-inactive users', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, active: false, expiryDate: daysFromNow(-1) });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
    });

    it('should not deactivate deleted users', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, deleted: true, expiryDate: daysFromNow(-1) });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
    });

    it('should not deactivate non-local users', async () => {
      const user = await createUser({ type: UserType.MEMBER, expiryDate: daysFromNow(-1) });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      const updated = await User.findOne({ where: { id: user.id } });
      expect(updated.active).to.be.true;
    });

    it('should send an account-expired notification for each deactivated user', async () => {
      await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(-1) });
      await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(-2) });

      const result = await new UserExpiryService().deactivateExpiredUsers();

      expect(notifyFake.callCount).to.equal(result.length);
    });

    it('should not send notifications when no users are deactivated', async () => {
      await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(10) });

      await new UserExpiryService().deactivateExpiredUsers();

      expect(notifyFake.callCount).to.equal(0);
    });
  });

  describe('notifyNearExpirationUsers', () => {
    it('should notify active local users expiring within 30 days', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(15) });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.include(user.id);
      expect(notifyFake.callCount).to.equal(1);
    });

    it('should notify all LocalUserTypes, not just LOCAL_USER', async () => {
      const users = await Promise.all(
        LocalUserTypes.map((type) => createUser({ type, expiryDate: daysFromNow(15) })),
      );

      const result = await new UserExpiryService().notifyNearExpirationUsers();
      const resultIds = result.map((u) => u.id);

      for (const user of users) {
        expect(resultIds).to.include(user.id);
      }
    });

    it('should not notify users expiring more than 30 days from now', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(31) });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      expect(notifyFake.callCount).to.equal(0);
    });

    it('should not notify users that have already expired', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(-1) });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      expect(notifyFake.callCount).to.equal(0);
    });

    it('should not notify users without an expiryDate', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: null });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      expect(notifyFake.callCount).to.equal(0);
    });

    it('should not notify inactive users', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, active: false, expiryDate: daysFromNow(15) });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
    });

    it('should not notify deleted users', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, deleted: true, expiryDate: daysFromNow(15) });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
    });

    it('should not notify non-local users', async () => {
      const user = await createUser({ type: UserType.MEMBER, expiryDate: daysFromNow(15) });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.not.include(user.id);
      expect(notifyFake.callCount).to.equal(0);
    });

    it('should set expiryNotificationSent to true after notifying', async () => {
      const user = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(15) });

      await new UserExpiryService().notifyNearExpirationUsers();

      const updated = await User.findOne({ where: { id: user.id } });
      expect(updated.expiryNotificationSent).to.be.true;
    });

    it('should not notify users that have already been notified', async () => {
      await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(15), expiryNotificationSent: true });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result).to.be.empty;
      expect(notifyFake.callCount).to.equal(0);
    });

    it('should only notify users not yet notified when a mix exists', async () => {
      const notYetNotified = await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(15), expiryNotificationSent: false });
      await createUser({ type: UserType.LOCAL_USER, expiryDate: daysFromNow(15), expiryNotificationSent: true });

      const result = await new UserExpiryService().notifyNearExpirationUsers();

      expect(result.map((u) => u.id)).to.deep.equal([notYetNotified.id]);
      expect(notifyFake.callCount).to.equal(1);
    });
  });
});
