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
import { DefaultContext, defaultContext, finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import WriteOff from '../../../src/entity/transactions/write-off';
import User, { UserType } from '../../../src/entity/user/user';
import { ADMIN_USER, inUserContext, UserFactory } from '../../helpers/user-factory';
import { expect, request } from 'chai';
import { WriteOffResponse } from '../../../src/controller/response/write-off-response';
import WriteOffController from '../../../src/controller/write-off-controller';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import BalanceService from '../../../src/service/balance-service';
import { json } from 'body-parser';
import VatGroup from '../../../src/entity/vat-group';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import { RbacSeeder, WriteOffSeeder } from '../../seed';

function writeOffEq(a: WriteOff, b: WriteOffResponse): Boolean {
  return a.to.id === b.to.id
    && a.amount.getAmount() === b.amount.amount
    && a.createdAt.toISOString() === b.createdAt
    && a.updatedAt.toISOString() === b.updatedAt;
}

describe('WriteOffController', () => {
  let ctx: DefaultContext & {
    writeOffs: WriteOff[];
    adminToken: string;
    token: string;
  };

  before(async () => {
    const c = { ...await defaultContext() };
    await truncateAllTables(c.connection);

    const admin = await (await UserFactory(await ADMIN_USER())).get();
    const localUser = await (await UserFactory()).get();

    const all = { all: new Set<string>(['*']) };
    const adminRole = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        WriteOff: {
          create: all,
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);

    const adminToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(admin, adminRole), 'nonce admin');
    const token = await c.tokenHandler.signToken(await new RbacSeeder().getToken(localUser, adminRole), 'nonce');

    const tokenMiddleware = new TokenMiddleware({ tokenHandler: c.tokenHandler, refreshFactor: 0.5 }).getMiddleware();
    c.app.use(json());
    c.app.use(tokenMiddleware);
    const controller = new WriteOffController({ specification: c.specification, roleManager: c.roleManager });
    c.app.use('/writeoffs', controller.getRouter());

    const vg = await (VatGroup.create({ percentage: 21, deleted: false, hidden: false, name: 'High VAT' })).save();
    ServerSettingsStore.deleteInstance();
    const serverSettingsStore = await ServerSettingsStore.getInstance().initialize();
    await serverSettingsStore.setSetting('highVatGroupId', vg.id);

    ctx = { ...c, adminToken, token, writeOffs: await new WriteOffSeeder().seed() };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /writeoffs', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const validator = ctx.specification.validateModel(
        'PaginatedWriteOffResponse',
        res.body,
        false,
        true,
      );
      expect(validator.valid).to.be.true;
    });
    it('should return an HTTP 200 and all write-offs in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const writeOffs = res.body.records as WriteOffResponse[];
      expect(res.body._pagination.count).to.equal(await WriteOff.count());
      writeOffs.forEach((writeOffResponse) => {
        const writeOff = ctx.writeOffs.find((w) => w.id === writeOffResponse.id);
        expect(writeOff).to.not.be.undefined;
        expect(
          writeOffEq(writeOff, writeOffResponse),
          `writeOffResponse ${writeOffResponse.id} to be correct`,
        ).to.be.true;
      });
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });
  describe('GET /writeoffs/:id', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const validation = ctx.specification
        .validateModel('WriteOffResponse', res.body, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should return single write-off', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const writeOff = res.body as WriteOffResponse;
      expect(writeOff.id).to.equal(1);
    });
    it('should return 404 if write-off does not exist', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/writeoffs/1')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });
  describe('POST /writeoffs', () => {
    before(async () => {
      const vg = await VatGroup.findOne({ where: { percentage: 21 } });
      if (!vg) await VatGroup.create({ percentage: 21, name: 'High VAT', deleted: false, hidden: false }).save();
    });
    it('should create a write-off', async () => {
      const amount = 1000;
      const buider = await (await UserFactory()).addBalance(-amount);
      await inUserContext([await buider.get()], async (user: User) => {
        const res = await request(ctx.app)
          .post('/writeoffs')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send({ toId: user.id });
        expect(res.status).to.equal(200);
        const writeOff = res.body as WriteOffResponse;

        expect(writeOff.to.id).to.equal(user.id);
        expect(writeOff.amount.amount).to.equal(amount);

        const newBalance = await new BalanceService().getBalance(user.id);
        expect(newBalance.amount.amount).to.equal(0);

        const newUser = await User.findOne({ where: { id: user.id } });
        expect(newUser).to.not.be.undefined;
        expect(newUser.deleted).to.be.true;
        expect(newUser.active).to.be.false;
      });
    });
    it('should return a 404 if the user does not exist', async () => {
      const res = await request(ctx.app)
        .post('/writeoffs')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ toId: 999999 });
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('User not found.');
    });
    it('should return a 403 if the user has positive balance', async () => {
      const amount = 1000;
      const buider = await (await UserFactory()).addBalance(amount);
      await inUserContext([await buider.get()], async (user: User) => {
        const res = await request(ctx.app)
          .post('/writeoffs')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send({ toId: user.id });
        expect(res.status).to.equal(400);
        expect(res.body).to.equal('User has balance, cannot create write off');
      });
    });
  });
});
