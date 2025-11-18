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

import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import generateBalance, { defaultBefore, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import Mailer from '../../../src/mailer';
import nodemailer, { Transporter } from 'nodemailer';
import { BasicApi, MemberAllAttributes, MembersApi } from 'gewisdb-ts-client';
import GewisDBSyncService from '../../../src/gewis/service/gewisdb-sync-service';
import { expect } from 'chai';
import { rootStubs } from '../../root-hooks';
import MemberUser from '../../../src/entity/user/member-user';
import User from '../../../src/entity/user/user';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';

async function createMemberUser(user: User, memberId: number): Promise<MemberUser> {
  expect(await MemberUser.findOne({ where: { user: { id: user.id } } })).to.be.null;
  expect(await MemberUser.findOne({ where: { memberId } })).to.be.null;
  const memberUser = Object.assign(new MemberUser(), {
    user,
    memberId,
  });
  await memberUser.save();
  return memberUser;
}

function toWebResponse(memberUser: MemberUser): MemberAllAttributes {
  // Expiration is one year in the future.
  const d = new Date(memberUser.user.updatedAt);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const expiration = new Date(year + 1, month, day);

  return {
    deleted: memberUser.user.deleted,
    email:  memberUser.user.email,
    expiration: expiration.toISOString(),
    given_name: memberUser.user.firstName,
    family_name: memberUser.user.lastName,
    is_18_plus: memberUser.user.ofAge,
    lidnr: memberUser.memberId,
  };
}

async function checkUpdateAgainstDB(update: MemberAllAttributes, userId: number) {
  const dbUser = await MemberUser.findOne({ where: { userId }, relations: ['user'] });
  expect(dbUser).to.not.be.undefined;
  expect(dbUser.user.deleted).to.eq(update.deleted);
  expect(dbUser.user.email).to.eq(update.email);
  expect(dbUser.user.firstName).to.eq(update.given_name);
  expect(dbUser.user.lastName).to.eq(update.family_name);
  expect(dbUser.user.ofAge).to.eq(update.is_18_plus);
  expect(dbUser.memberId).to.eq(update.lidnr);
}

describe('GewisDBSyncService', () => {
  let ctx: DefaultContext;
  let membersApiStub: sinon.SinonStubbedInstance<MembersApi>;
  let basicApiStub: sinon.SinonStubbedInstance<BasicApi>;
  let sandbox: SinonSandbox;
  let sendMailFake: SinonSpy;
  let serverSettingsStore: ServerSettingsStore;

  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    } as any;
    ServerSettingsStore.deleteInstance();
    serverSettingsStore = await ServerSettingsStore.getInstance().initialize();
  });

  beforeEach(async () => {
    // Restore the default stub
    rootStubs?.mail.restore();
    await serverSettingsStore.setSetting('allowGewisSyncDelete', false);
    Mailer.reset();
    sandbox = sinon.createSandbox();
    sendMailFake = sandbox.spy();
    sandbox.stub(nodemailer, 'createTransport').returns({
      sendMail: sendMailFake,
    } as any as Transporter);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    sandbox.restore();
    sinon.restore();
  });
  
  describe('sync', () => {
    let syncService: GewisDBSyncService;

    beforeEach(() => {
      syncService = new GewisDBSyncService();
      membersApiStub = sinon.createStubInstance(MembersApi);
      basicApiStub = sinon.createStubInstance(BasicApi);
      // @ts-ignore
      syncService.api = membersApiStub as any;
      // @ts-ignore
      syncService.pinger = basicApiStub as any;

      basicApiStub.healthGet.resolves({ data: { healthy: true, sync_paused: false } } as any);
    });

    describe('guard', () => {
      it('should return true if user is a GEWIS user', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            const result = await syncService.guard(memberUser.user);
            expect(result).to.be.true;
          },
        );
      });

      it('should return false if user is not a GEWIS user', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const result = await syncService.guard(user);
            expect(result).to.be.false;
          },
        );
      });
    });


    it('should abort synchronization if GEWISDB API is unhealthy', async () => {
      basicApiStub.healthGet.resolves({ data: { healthy: false, sync_paused: false } } as any);
      await expect(syncService.pre()).to.be.rejectedWith('GEWISDB is not ready for syncing');
      sinon.assert.calledOnce(basicApiStub.healthGet);
    });

    it('should allow syncing if GEWISDB API is healthy', async () => {
      basicApiStub.healthGet.resolves({ data: { healthy: true, sync_paused: false } } as any);
      const result = await syncService.pre();
      expect(result).to.be.undefined;
      sinon.assert.calledOnce(basicApiStub.healthGet);
    });

    it('should thrown an error if GEWIS User is not found', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (user: User) => {
          await expect(syncService.sync(user)).to.be.rejectedWith('Member User not found.');
        },
      );
    });

    it('should update user details if sync is needed', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (user: User) => {
          const memberUser = await createMemberUser(user, user.id);
          const updatedResponse: MemberAllAttributes = toWebResponse(memberUser);
          updatedResponse.given_name = 'UpdatedName';
          updatedResponse.family_name = 'UpdatedFamily';
          updatedResponse.email = 'updated@example.com';
          updatedResponse.is_18_plus = true;

          membersApiStub.membersLidnrGet.resolves({ data: { data: updatedResponse } } as any);

          const result = await syncService.sync(memberUser.user);
          expect(result).to.be.true;
          await checkUpdateAgainstDB(updatedResponse, memberUser.user.id);
        },
      );
    });

    it('should not update user details in dry-run mode', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (user: User) => {
          const memberUser = await createMemberUser(user, user.id);
          const originalFirstName = memberUser.user.firstName;
          const originalLastName = memberUser.user.lastName;
          const originalEmail = memberUser.user.email;
          const originalOfAge = memberUser.user.ofAge;

          const updatedResponse: MemberAllAttributes = toWebResponse(memberUser);
          updatedResponse.given_name = 'UpdatedName';
          updatedResponse.family_name = 'UpdatedFamily';
          updatedResponse.email = 'updated@example.com';
          updatedResponse.is_18_plus = true;

          membersApiStub.membersLidnrGet.resolves({ data: { data: updatedResponse } } as any);

          const result = await syncService.sync(memberUser.user, true);
          expect(result).to.be.true;

          // Check that the user was not actually updated in the database
          const dbUser = await MemberUser.findOne({ where: { userId: memberUser.user.id }, relations: ['user'] });
          expect(dbUser.user.firstName).to.eq(originalFirstName);
          expect(dbUser.user.lastName).to.eq(originalLastName);
          expect(dbUser.user.email).to.eq(originalEmail);
          expect(dbUser.user.ofAge).to.eq(originalOfAge);
        },
      );
    });

    it('should return false if user has no GEWISDB entry', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (user: User) => {
          const memberUser = await createMemberUser(user, user.id);
          membersApiStub.membersLidnrGet.resolves({ data: { data: null } } as any);

          const result = await syncService.sync(memberUser.user);
          expect(result).to.be.false;
        },
      );
    });
    
    it('should return false if user is expired', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (user: User) => {
          const memberUser = await createMemberUser(user, user.id);
          const updatedResponse: MemberAllAttributes = toWebResponse(memberUser);
          updatedResponse.expiration = new Date(Date.now() - 100000).toISOString();
          membersApiStub.membersLidnrGet.resolves({ data: { data: updatedResponse } } as any);

          const result = await syncService.sync(memberUser.user);
          expect(result).to.be.false;
        },
      );
    });
      
    it('should return true if no update is needed', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (user: User) => {
          const memberUser = await createMemberUser(user, user.id);
          const updatedResponse: MemberAllAttributes = toWebResponse(memberUser);
          membersApiStub.membersLidnrGet.resolves({ data: { data: updatedResponse } } as any);
          const result = await syncService.sync(memberUser.user);
          expect(result).to.be.true;
        });
    }); 

    describe('down', () => {
      it('should correctly delete the user', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', true);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            await syncService.down(memberUser.user);
            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            expect(dbUser.active).to.be.false;
            expect(dbUser.deleted).to.be.true;
            expect(dbUser.canGoIntoDebt).to.be.false;
          },
        );
      });
      it('should not delete the user if allowGewisSyncDelete is false', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', false);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            await syncService.down(memberUser.user);
            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            expect(dbUser.active).to.be.true;
            expect(dbUser.deleted).to.be.false;
            expect(dbUser.canGoIntoDebt).to.be.true;
            expect(sendMailFake).to.be.callCount(0);
          },
        );
      });
      it('should not delete the user if balance is non-zero', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', true);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            await generateBalance(100, memberUser.user.id);
            await syncService.down(memberUser.user);
            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            expect(dbUser.active).to.be.false;
            expect(dbUser.deleted).to.be.false;
            expect(dbUser.canGoIntoDebt).to.be.false;
            expect(sendMailFake).to.be.callCount(1);
          },
        );
      });
      it('should not send an email twice to the user', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', true);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            await generateBalance(100, memberUser.user.id);
            await syncService.down(memberUser.user);

            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            await syncService.down(dbUser);
            expect(sendMailFake).to.be.callCount(1);
          },
        );
      });
      it('should not send an email to the use if balance is 0r', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', true);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            await syncService.down(memberUser.user);
            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            expect(dbUser.active).to.be.false;
            expect(dbUser.deleted).to.be.true;
            expect(dbUser.canGoIntoDebt).to.be.false;
            expect(sendMailFake).to.be.callCount(0);
          });
      });

      it('should not delete the user in dry-run mode', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', true);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            const originalActive = user.active;
            const originalDeleted = user.deleted;
            const originalCanGoIntoDebt = user.canGoIntoDebt;

            await syncService.down(memberUser.user, true);
            
            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            expect(dbUser.active).to.eq(originalActive);
            expect(dbUser.deleted).to.eq(originalDeleted);
            expect(dbUser.canGoIntoDebt).to.eq(originalCanGoIntoDebt);
            expect(sendMailFake).to.be.callCount(0);
          },
        );
      });

      it('should not send email in dry-run mode even with non-zero balance', async () => {
        await serverSettingsStore.setSetting('allowGewisSyncDelete', true);
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (user: User) => {
            const memberUser = await createMemberUser(user, user.id);
            await generateBalance(100, memberUser.user.id);
            
            const originalActive = user.active;
            const originalDeleted = user.deleted;
            const originalCanGoIntoDebt = user.canGoIntoDebt;

            await syncService.down(memberUser.user, true);
            
            const dbUser = await User.findOne({ where: { id: memberUser.user.id } });
            expect(dbUser.active).to.eq(originalActive);
            expect(dbUser.deleted).to.eq(originalDeleted);
            expect(dbUser.canGoIntoDebt).to.eq(originalCanGoIntoDebt);
            expect(sendMailFake).to.be.callCount(0);
          },
        );
      });
    });
  });
});