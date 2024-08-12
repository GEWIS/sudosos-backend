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
import { defaultContext, finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { DataSource } from 'typeorm';
import { Express } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import TokenHandler from '../../../src/authentication/token-handler';
import RoleManager from '../../../src/rbac/role-manager';
import WriteOff from '../../../src/entity/transactions/write-off';
import { seedWriteOffs } from '../../seed';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import chai, { expect } from 'chai';
import WriteOffService from '../../../src/service/write-off-service';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import User from '../../../src/entity/user/user';
import VatGroup from '../../../src/entity/vat-group';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';

chai.use(deepEqualInAnyOrder);
describe('WriteOffService', () => {
  let ctx: {
    app: Express;
    specification: SwaggerSpecification;
    roleManager: RoleManager;
    connection: DataSource;
    tokenHandler: TokenHandler;
    writeOffs: WriteOff[];
  };

  before(async () => {
    const c = { ...await defaultContext() };
    await truncateAllTables(c.connection);

    const vg = await (VatGroup.create({ percentage: 21, deleted: false, hidden: false, name: 'High VAT' })).save();
    ServerSettingsStore.deleteInstance();
    const serverSettingsStore = await ServerSettingsStore.getInstance().initialize();
    await serverSettingsStore.setSetting('highVatGroupId', vg.id);

    ctx = { ...c, writeOffs: await seedWriteOffs() };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('getWriteOffs function', () => {
    it('should return all write-offs with no input specification', async () => {
      const res = await WriteOffService.getWriteOffs();
      expect(res.records.length).to.equal(ctx.writeOffs.length);
      expect(res.records.map(writeOff => writeOff.id)).to.deep.equalInAnyOrder(ctx.writeOffs.map(writeOff => writeOff.id));
    });
  });
  describe('getOptions function', () => {
    it('should return all write-offs with no input specification', async () => {
      const options = WriteOffService.getOptions({});
      const res = await WriteOff.find(options);
      expect(res.length).to.equal(ctx.writeOffs.length);
      expect(res.map(writeOff => writeOff.id)).to.deep.equalInAnyOrder(ctx.writeOffs.map(writeOff => writeOff.id));
    });
    it('should return all write-offs with toId filter', async () => {
      const writeOff = ctx.writeOffs[0];
      const options = WriteOffService.getOptions({ toId: writeOff.to.id });
      const res = await WriteOff.find(options);
      expect(res.length).to.be.greaterThan(0);
      res.forEach((w) => {
        expect(w.to.id).to.equal(writeOff.to.id);
      });
    });
    it('should return single write-off if id is specified', async () => {
      const writeOff = ctx.writeOffs[0];
      const options = WriteOffService.getOptions({ writeOffId: writeOff.id });
      const res = await WriteOff.findOne(options);
      expect(res).to.not.be.undefined;
      expect(res.id).to.equal(writeOff.id);
    });
  });
  describe('createWriteOff function', () => {
    it('should create a write-off', async () => {
      const amount = 100;
      const builder = await (await UserFactory()).addBalance(-amount);
      await inUserContext([await builder.get()], async (user: User) => {
        const writeOff = await (new WriteOffService()).createWriteOffAndCloseUser(user);
        expect(writeOff.amount.amount).to.equal(100);
        expect(writeOff.to.id).to.equal(user.id);
        expect(writeOff.transfer).to.not.be.undefined;
        expect(writeOff.transfer.amountInclVat.amount).to.equal(100);
        expect(writeOff.transfer.to.id).to.equal(user.id);
        const u = await User.findOne({ where: { id: user.id } });
        expect(u.deleted).to.be.true;
        expect(u.active).to.be.false;
      });
    });
    it('should error when user has positive balance', async () => {
      const amount = 100;
      const builder = await (await UserFactory()).addBalance(amount);
      await inUserContext([await builder.get()], async (user: User) => {
        const func = async () => (new WriteOffService()).createWriteOffAndCloseUser(user);
        await expect(func()).to.be.rejectedWith('User has balance, cannot create write off');
      });
    });
    it('should error if HIGH VAT is not set', async () => {
      const id = ServerSettingsStore.getInstance().getSetting('highVatGroupId');
      await ServerSettingsStore.getInstance().setSetting('highVatGroupId', -1);

      const amount = -100;
      const builder = await (await UserFactory()).addBalance(amount);
      await inUserContext([await builder.get()], async (user: User) => {
        const func = async () => (new WriteOffService()).createWriteOffAndCloseUser(user);
        await expect(func()).to.be.rejectedWith('High vat group not found');
      });

      await ServerSettingsStore.getInstance().setSetting('highVatGroupId', id);
    });
  });
});
