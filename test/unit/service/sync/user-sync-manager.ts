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

import { expect } from 'chai';
import sinon from 'sinon';
import UserSyncManager from '../../../../src/service/sync/user/user-sync-manager';
import { UserSyncService } from '../../../../src/service/sync/user/user-sync-service';
import User, { UserType } from '../../../../src/entity/user/user';
import { defaultAfter, defaultBefore, DefaultContext } from '../../../helpers/test-helpers';

/**
 * Test implementation of UserSyncService for testing purposes.
 */
class TestSyncService extends UserSyncService {
  public targets: UserType[] = [UserType.MEMBER, UserType.ORGAN];

  public shouldSkip = false;

  public shouldFail = false;

  public shouldThrow = false;

  public shouldThrowInPre = false;

  public shouldThrowInSync = false;

  public preCalled = false;

  public postCalled = false;

  public fetchCalled = false;

  public syncCalled = false;

  public downCalled = false;

  public guardCalled = false;

  async guard(user: User): Promise<boolean> {
    this.guardCalled = true;
    return this.targets.includes(user.type) && !this.shouldSkip;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async sync(user: User, isDryRun?: boolean): Promise<boolean> {
    this.syncCalled = true;
    if (this.shouldThrowInSync) {
      throw new Error('Test sync error');
    }
    return !this.shouldFail;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async down(user: User, isDryRun?: boolean): Promise<void> {
    this.downCalled = true;
    if (this.shouldThrow) {
      throw new Error('Test down error');
    }
  }

  async fetch(): Promise<void> {
    this.fetchCalled = true;
    if (this.shouldThrow) {
      throw new Error('Test fetch error');
    }
  }

  async pre(): Promise<void> {
    this.preCalled = true;
    if (this.shouldThrowInPre) {
      throw new Error('Test pre error');
    }
  }

  async post(): Promise<void> {
    this.postCalled = true;
    if (this.shouldThrow) {
      throw new Error('Test post error');
    }
  }

  reset(): void {
    this.shouldSkip = false;
    this.shouldFail = false;
    this.shouldThrow = false;
    this.shouldThrowInPre = false;
    this.shouldThrowInSync = false;
    this.preCalled = false;
    this.postCalled = false;
    this.fetchCalled = false;
    this.syncCalled = false;
    this.downCalled = false;
    this.guardCalled = false;
  }
}

describe('UserSyncManager', (): void => {
  let ctx: DefaultContext;
  let syncManager: UserSyncManager;
  let testService1: TestSyncService;
  let testService2: TestSyncService;

  before(async (): Promise<void> => {
    ctx = await defaultBefore();
  });

  after(async (): Promise<void> => {
    await defaultAfter(ctx);
  });

  beforeEach(async (): Promise<void> => {
    // Clean up any existing users before each test
    await ctx.connection.query('DELETE FROM user');
    
    testService1 = new TestSyncService();
    testService2 = new TestSyncService();
    syncManager = new UserSyncManager([testService1, testService2]);
  });

  afterEach((): void => {
    testService1.reset();
    testService2.reset();
  });

  describe('getTargets', (): void => {
    it('should return users of types targeted by services', async (): Promise<void> => {
      // Create test users directly
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      const organ = await User.save({
        firstName: 'Organ',
        lastName: 'User',
        type: UserType.ORGAN,
        active: true,
        acceptedToS: 'NOT_REQUIRED' as any,
        canGoIntoDebt: true,
      });

      const localUser = await User.save({
        firstName: 'Local',
        lastName: 'User',
        type: UserType.LOCAL_USER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      const targets = await syncManager.getTargets();

      // Should include MEMBER and ORGAN users, but not LOCAL_USER
      expect(targets).to.have.length(2);
      expect(targets.some(u => u.id === member.id)).to.be.true;
      expect(targets.some(u => u.id === organ.id)).to.be.true;
      expect(targets.some(u => u.id === localUser.id)).to.be.false;
    });

    it('should not return deleted users', async (): Promise<void> => {
      await User.save({
        firstName: 'Deleted',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        deleted: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      const targets = await syncManager.getTargets();
      expect(targets).to.have.length(0);
    });

    it('should handle empty service list', async (): Promise<void> => {
      const emptyManager = new UserSyncManager([]);
      const targets = await emptyManager.getTargets();
      expect(targets).to.have.length(0);
    });
  });

  describe('run', (): void => {
    it('should successfully sync users and return results', async (): Promise<void> => {
      await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      await User.save({
        firstName: 'Organ',
        lastName: 'User',
        type: UserType.ORGAN,
        active: true,
        acceptedToS: 'NOT_REQUIRED' as any,
        canGoIntoDebt: true,
      });

      const results = await syncManager.run();

      expect(results.passed).to.have.length(2);
      expect(results.failed).to.have.length(0);
      expect(results.skipped).to.have.length(0);
      expect(testService1.preCalled).to.be.true;
      expect(testService1.postCalled).to.be.true;
      expect(testService2.preCalled).to.be.true;
      expect(testService2.postCalled).to.be.true;
    });

    it('should handle skipped users', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      // Make both services skip the user
      testService1.shouldSkip = true;
      testService2.shouldSkip = true;

      const results = await syncManager.run();

      expect(results.passed).to.have.length(0);
      expect(results.failed).to.have.length(0);
      expect(results.skipped).to.have.length(1);
      expect(results.skipped[0].id).to.eq(member.id);
    });

    it('should handle failed syncs', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      // Make both services fail
      testService1.shouldFail = true;
      testService2.shouldFail = true;

      const results = await syncManager.run();

      expect(results.passed).to.have.length(0);
      expect(results.failed).to.have.length(1);
      expect(results.skipped).to.have.length(0);
      expect(results.failed[0].id).to.eq(member.id);
      expect(testService1.downCalled).to.be.true;
    });

    it('should handle sync errors gracefully', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      // Make both services throw errors in sync
      testService1.shouldThrowInSync = true;
      testService2.shouldThrowInSync = true;

      const results = await syncManager.run();

      expect(results.passed).to.have.length(0);
      expect(results.failed).to.have.length(1);
      expect(results.skipped).to.have.length(0);
      expect(results.failed[0].id).to.eq(member.id);
    });

    it('should abort on pre() error', async (): Promise<void> => {
      await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      // Make pre() throw an error
      testService1.shouldThrowInPre = true;

      const results = await syncManager.run();

      expect(results.passed).to.have.length(0);
      expect(results.failed).to.have.length(0);
      expect(results.skipped).to.have.length(0);
      expect(testService1.syncCalled).to.be.false;
    });

    it('should call post() even after errors', async (): Promise<void> => {
      await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      // Make only the sync method throw, not post
      const syncStub = sinon.stub(testService1, 'sync').callsFake(async (): Promise<boolean> => {
        testService1.syncCalled = true;
        throw new Error('Test sync error');
      });

      await syncManager.run();

      expect(testService1.postCalled).to.be.true;
      expect(testService2.postCalled).to.be.true;

      syncStub.restore();
    });
  });

  describe('runDry', (): void => {
    it('should perform dry run and return results', async (): Promise<void> => {
      await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      const results = await syncManager.runDry();

      expect(results.passed).to.have.length(1);
      expect(results.failed).to.have.length(0);
      expect(results.skipped).to.have.length(0);
      expect(testService1.syncCalled).to.be.true;
      expect(testService1.downCalled).to.be.false; // Should not call down for passed users
    });

    it('should call down() for failed users in dry run', async (): Promise<void> => {
      await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      testService1.shouldFail = true;
      testService2.shouldFail = true;

      const results = await syncManager.runDry();

      expect(results.passed).to.have.length(0);
      expect(results.failed).to.have.length(1);
      expect(results.skipped).to.have.length(0);
      expect(testService1.downCalled).to.be.true;
    });
  });

  describe('fetch', (): void => {
    it('should call fetch on all services', async (): Promise<void> => {
      await syncManager.fetch();

      expect(testService1.preCalled).to.be.true;
      expect(testService1.fetchCalled).to.be.true;
      expect(testService1.postCalled).to.be.true;
      expect(testService2.preCalled).to.be.true;
      expect(testService2.fetchCalled).to.be.true;
      expect(testService2.postCalled).to.be.true;
    });

    it('should handle fetch errors gracefully', async (): Promise<void> => {
      // Make only the fetch method throw, not post
      const originalFetch = testService1.fetch;
      testService1.fetch = async (): Promise<void> => {
        testService1.fetchCalled = true;
        throw new Error('Test fetch error');
      };

      // Should not throw, but handle error gracefully
      await expect(syncManager.fetch()).to.not.be.rejected;
      expect(testService1.postCalled).to.be.true;

      // Restore original method
      testService1.fetch = originalFetch;
    });

    it('should call post() even after fetch errors', async (): Promise<void> => {
      // Make only the fetch method throw, not post
      const originalFetch = testService1.fetch;
      testService1.fetch = async (): Promise<void> => {
        testService1.fetchCalled = true;
        throw new Error('Test fetch error');
      };

      await syncManager.fetch();

      expect(testService1.postCalled).to.be.true;
      expect(testService2.postCalled).to.be.true;

      // Restore original method
      testService1.fetch = originalFetch;
    });
  });

  describe('sync', (): void => {
    it('should aggregate results from multiple services', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      // Service 1 succeeds, Service 2 fails
      testService1.shouldFail = false;
      testService2.shouldFail = true;

      const result = await syncManager.sync(member);

      expect(result.skipped).to.be.false;
      expect(result.result).to.be.true; // At least one service succeeded
      expect(testService1.syncCalled).to.be.true;
      expect(testService2.syncCalled).to.be.true;
    });

    it('should return skipped=true if all services skip', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      testService1.shouldSkip = true;
      testService2.shouldSkip = true;

      const result = await syncManager.sync(member);

      expect(result.skipped).to.be.true;
      expect(result.result).to.be.false;
    });

    it('should return result=false if all services fail', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      testService1.shouldFail = true;
      testService2.shouldFail = true;

      const result = await syncManager.sync(member);

      expect(result.skipped).to.be.false;
      expect(result.result).to.be.false;
    });
  });

  describe('down', (): void => {
    it('should call down on all services', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      await syncManager.down(member);

      expect(testService1.downCalled).to.be.true;
      expect(testService2.downCalled).to.be.true;
    });

    it('should handle down errors gracefully', async (): Promise<void> => {
      const member = await User.save({
        firstName: 'Member',
        lastName: 'User',
        type: UserType.MEMBER,
        active: true,
        acceptedToS: 'ACCEPTED' as any,
        canGoIntoDebt: true,
      });

      testService1.shouldThrow = true;

      // Should not throw, but handle error gracefully
      await expect(syncManager.down(member)).to.not.be.rejected;
      expect(testService2.downCalled).to.be.true;
    });
  });

  describe('pre and post', (): void => {
    it('should call pre on all services', async (): Promise<void> => {
      await syncManager.pre();

      expect(testService1.preCalled).to.be.true;
      expect(testService2.preCalled).to.be.true;
    });

    it('should call post on all services', async (): Promise<void> => {
      await syncManager.post();

      expect(testService1.postCalled).to.be.true;
      expect(testService2.postCalled).to.be.true;
    });
  });
});
