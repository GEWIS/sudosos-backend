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
 */
import { expect } from 'chai';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import { defaultBefore, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import User from '../../../src/entity/user/user';
import GewisUser from '../../../src/gewis/entity/gewis-user';
import { seedUsers } from '../../seed';
import seedGEWISUsers from '../../../src/gewis/database/seed';
import GewisDBService from '../../../src/gewis/service/gewisdb-service';
import { BasicApi, MemberAllAttributes, MembersApi } from 'gewisdb-ts-client';
import nodemailer, { Transporter } from 'nodemailer';
import Mailer from '../../../src/mailer';
import {In} from "typeorm";

describe('GEWISDB Service', () => {

  let ctx: DefaultContext & {
    users: User[],
    gewisUsers: GewisUser[],
  };

  let membersApiStub: sinon.SinonStubbedInstance<MembersApi>;
  let basicApiStub: sinon.SinonStubbedInstance<BasicApi>;

  let sandbox: SinonSandbox;
  let sendMailFake: SinonSpy;

  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    } as any;
    ctx.users = await seedUsers();
    ctx.gewisUsers = await seedGEWISUsers(ctx.users);

    Mailer.reset();

    sandbox = sinon.createSandbox();
    sendMailFake = sandbox.spy();
    sandbox.stub(nodemailer, 'createTransport').returns({
      sendMail: sendMailFake,
    } as any as Transporter);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
    sinon.restore();
    sandbox.restore();
  });

  afterEach(() => {
    sendMailFake.resetHistory();
  });

  describe('sync', () => {

    function toWebResponse(gewisUser: GewisUser): MemberAllAttributes {
      // Expiration is one year in the future.
      const d = new Date(gewisUser.user.updatedAt);
      const year = d.getFullYear();
      const month = d.getMonth();
      const day = d.getDate();
      const expiration = new Date(year + 1, month, day);

      return {
        deleted: gewisUser.user.deleted,
        email:  gewisUser.user.email,
        expiration: expiration.toISOString(),
        given_name: gewisUser.user.firstName,
        family_name: gewisUser.user.lastName,
        is_18_plus: gewisUser.user.ofAge,
        lidnr: gewisUser.gewisId,
      };
    }

    async function checkUpdateAgainstDB(update: MemberAllAttributes, userId: number) {
      const dbUser = await GewisUser.findOne({ where: { userId }, relations: ['user'] });
      expect(dbUser).to.not.be.undefined;
      expect(dbUser.user.deleted).to.eq(update.deleted);
      expect(dbUser.user.email).to.eq(update.email);
      expect(dbUser.user.firstName).to.eq(update.given_name);
      expect(dbUser.user.lastName).to.eq(update.family_name);
      expect(dbUser.user.ofAge).to.eq(update.is_18_plus);
      expect(dbUser.gewisId).to.eq(update.lidnr);
    }

    beforeEach(() => {
      membersApiStub = sinon.createStubInstance(MembersApi);
      basicApiStub = sinon.createStubInstance(BasicApi);

      GewisDBService.api = membersApiStub as any;
      GewisDBService.pinger = basicApiStub as any;

      basicApiStub.healthGet.returns(Promise.resolve({ data: { healthy: true, sync_paused: false } }) as any);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should abort synchronization if the GEWISDB API is unhealthy', async () => {
      basicApiStub.healthGet.returns(Promise.resolve({ data: { healthy: false, sync_paused: false } }) as any);

      const result = await GewisDBService.syncAll();

      expect(result).to.be.null;
      sinon.assert.calledOnce(basicApiStub.healthGet);
      sinon.assert.notCalled(membersApiStub.membersLidnrGet);
    });

    it('should abort synchronization if the GEWISDB API is paused', async () => {
      basicApiStub.healthGet.returns(Promise.resolve({ data: { healthy: true, sync_paused: true } }) as any);

      const result = await GewisDBService.syncAll();

      expect(result).to.be.null;
      sinon.assert.calledOnce(basicApiStub.healthGet);
      sinon.assert.notCalled(membersApiStub.membersLidnrGet);
    });

    it('should start synchronization if the GEWISDB API is healthy', async () => {
      basicApiStub.healthGet.returns(Promise.resolve({ data: { healthy: true, sync_paused: false } }) as any);
      membersApiStub.membersLidnrGet.returns(Promise.resolve({ data: {} }) as any);
      const result = await GewisDBService.syncAll();

      expect(result).to.be.empty;
      sinon.assert.calledOnce(basicApiStub.healthGet);
    });


    it('should sync a single non-deleted GEWIS user with the database', async () => {
      const user = await GewisUser.findOne({ where: { user: { deleted: false } }, relations: ['user'] });
      const update = toWebResponse(user);
      update.given_name = `updated ${user.user.firstName}`;
      // @ts-ignore
      membersApiStub.membersLidnrGet.returns(Promise.resolve({
        data: {
          data: update,
        },
      }));

      await GewisDBService.sync([user]);
      await checkUpdateAgainstDB(update, user.userId);
    });

    it('should sync multiple non-deleted GEWIS user with the database', async () => {
      const users = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'], take: 5 });

      const updates: { [key: number]: MemberAllAttributes; } = {};
      membersApiStub.membersLidnrGet.callsFake((async (gewisId: number) => {
        const user = users.find(u => u.gewisId === gewisId);
        if (!user) return Promise.resolve({ data: null });

        const update = toWebResponse(user);
        updates[user.userId] = update;

        update.given_name = `updated ${user.user.firstName}`;
        update.family_name = `updated ${user.user.lastName}`;
        update.email = `updated ${user.user.email}`;
        update.is_18_plus = !user.user.ofAge;

        return Promise.resolve({
          data: { data: update },
        });
      }) as any);


      await GewisDBService.sync(users);
      for (const u of users) { await checkUpdateAgainstDB(updates[u.userId], u.userId); }
    });

    it('should handle cases where a user cannot be found in the GEWIS database', async () => {
      const user = await GewisUser.findOne({ where: { user: { deleted: false } }, relations: ['user'] });
      membersApiStub.membersLidnrGet.returns(Promise.resolve({
        data: {},
      } as any));

      await GewisDBService.sync([user]);
      // Check if user remained the same
      await checkUpdateAgainstDB(toWebResponse(user), user.userId);
    });

    it('should return an empty array if there were no updates', async () => {
      const users = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'], take: 5 });

      const updates: { [key: number]: MemberAllAttributes; } = {};
      membersApiStub.membersLidnrGet.callsFake((async (gewisId: number) => {
        const user = users.find(u => u.gewisId === gewisId);
        if (!user) return Promise.resolve({ data: null });

        const update = toWebResponse(user);
        updates[user.userId] = update;

        return Promise.resolve({
          data: { data: update },
        });
      }) as any);


      const res = await GewisDBService.sync(users);
      expect(res).to.be.empty;
      for (const u of users) { await checkUpdateAgainstDB(updates[u.userId], u.userId); }
    });

    it('should return an array with all updated users', async () => {
      const users = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'], take: 5 });
      const toUpdate = (users.filter((u) => (u.userId % 2) === 0)).map((u) => u.userId);
      expect(toUpdate).to.not.be.empty;

      const updates: { [key: number]: MemberAllAttributes; } = {};
      membersApiStub.membersLidnrGet.callsFake((async (gewisId: number) => {
        const user = users.find(u => u.gewisId === gewisId);
        if (!user) return Promise.resolve({ data: null });

        const update = toWebResponse(user);
        updates[user.userId] = update;

        if (toUpdate.indexOf(user.userId) !== -1) {
          update.given_name = `updated ${user.user.firstName}`;
          update.family_name = `updated ${user.user.lastName}`;
          update.email = `updated ${user.user.email}`;
          update.is_18_plus = !user.user.ofAge;
        }

        return Promise.resolve({
          data: { data: update },
        });
      }) as any);


      const res = await GewisDBService.sync(users);
      expect(res).to.not.be.empty;
      expect(res.map((u => u.id))).to.deep.equalInAnyOrder(toUpdate);
      for (const u of toUpdate) { await checkUpdateAgainstDB(updates[u], u); }
    });

    it('should properly handle expired users', async function () {
      const users = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'], take: 5 });

      const updates: { [key: number]: MemberAllAttributes; } = {};
      membersApiStub.membersLidnrGet.callsFake((async (gewisId: number) => {
        const user = users.find(u => u.gewisId === gewisId);
        if (!user) return Promise.resolve({ data: null });

        const update = toWebResponse(user);
        update.expiration = new Date(2020, 1, 1).toISOString();
        updates[user.userId] = update;

        return Promise.resolve({
          data: { data: update },
        });
      }) as any);


      const res = await GewisDBService.sync(users);
      res.forEach((u) => {
        expect(u.active).to.be.false;
        expect(u.deleted).to.be.true;
        expect(u.canGoIntoDebt).to.be.false;
      });
    });

    it('should send email to expired users', async function () {
      const users = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'], take: 5 });

      const updates: { [key: number]: MemberAllAttributes; } = {};
      membersApiStub.membersLidnrGet.callsFake((async (gewisId: number) => {
        const user = users.find(u => u.gewisId === gewisId);
        if (!user) return Promise.resolve({ data: null });

        const update = toWebResponse(user);
        update.expiration = new Date(2020, 1, 1).toISOString();
        updates[user.userId] = update;

        return Promise.resolve({
          data: { data: update },
        });
      }) as any);


      const res = await GewisDBService.sync(users);
      res.forEach((u) => {
        expect(u.active).to.be.false;
        expect(u.deleted).to.be.true;
        expect(u.canGoIntoDebt).to.be.false;
      });

      expect(sendMailFake).to.be.callCount(res.length);
    });
    it('should not commit changes to the database if commit is false', async function () {
      const users = await GewisUser.find({ where: { user: { deleted: false, active: true } }, relations: ['user'], take: 5 });

      const updates: { [key: number]: MemberAllAttributes; } = {};
      membersApiStub.membersLidnrGet.callsFake((async (gewisId: number) => {
        const user = users.find(u => u.gewisId === gewisId);
        if (!user) return Promise.resolve({ data: null });

        const update = toWebResponse(user);
        update.expiration = new Date(2020, 1, 1).toISOString();
        updates[user.userId] = update;

        return Promise.resolve({
          data: { data: update },
        });
      }) as any);


      await GewisDBService.sync(users, false);
      const res = await User.find({ where: { id: In(users.map(u => u.userId)) } });
      expect(res).to.not.be.empty;
      expect(res.length).to.eq(users.length);
      res.forEach((u) => {
        expect(u.active).to.be.true;
        expect(u.deleted).to.be.false;
      });

      expect(sendMailFake).to.be.callCount(0);
    });
  });
});
