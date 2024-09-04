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
import { defaultContext, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import { seedUsers } from '../../seed';
import { getToken, seedRoles } from '../../seed/rbac';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { json } from 'body-parser';
import ServerSettingsController from '../../../src/controller/server-settings-controller';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import { expect, request } from 'chai';
import sinon from 'sinon';

describe('ServerSettingsController', () => {
  let ctx: DefaultContext & {
    admin: User,
    user: User,
    adminToken: string,
    userToken: string,
  };

  before(async () => {
    const c = { ...await defaultContext() };

    const users = await seedUsers();

    const all = { all: new Set<string>(['*']) };
    const adminRole = await seedRoles([{
      name: 'Admin',
      permissions: {
        Maintenance: {
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);

    const admin = users.find((u) => u.type === UserType.LOCAL_ADMIN);
    const user = users.find((u) => u.type === UserType.LOCAL_USER);
    const adminToken = await c.tokenHandler.signToken(await getToken(admin, adminRole), 'nonce admin');
    const userToken = await c.tokenHandler.signToken(await getToken(user, adminRole), 'nonce');

    const tokenMiddleware = new TokenMiddleware({ tokenHandler: c.tokenHandler, refreshFactor: 0.5 }).getMiddleware();
    c.app.use(json());
    c.app.use(tokenMiddleware);
    const controller = new ServerSettingsController({ specification: c.specification, roleManager: c.roleManager });
    c.app.use('/server-settings', controller.getRouter());

    ServerSettingsStore.deleteInstance();
    await ServerSettingsStore.getInstance().initialize();

    ctx = {
      ...c,
      admin,
      user,
      adminToken,
      userToken,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
    ServerSettingsStore.deleteInstance();
  });

  describe('PUT /server-settings/maintenance-mode', () => {
    it('should return 204 and correctly set maintenance mode', async () => {
      const store = ServerSettingsStore.getInstance();
      const enabled = await store.getSettingFromDatabase('maintenanceMode');

      const res = await request(ctx.app)
        .put('/server-settings/maintenance-mode')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ enabled: !enabled });
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      expect(store.getSetting('maintenanceMode')).to.equal(!enabled);
      await expect(store.getSettingFromDatabase('maintenanceMode')).to.eventually.equal(!enabled);

      // Cleanup
      await store.setSetting('maintenanceMode', enabled);
    });
    it('should return 400 if invalid request', async () => {
      const res = await request(ctx.app)
        .put('/server-settings/maintenance-mode')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ enabled: 'Ploperdeplop' });
      expect(res.status).to.equal(400);
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .put('/server-settings/maintenance-mode')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ enabled: true });
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should return 500 if database error', async () => {
      const store = ServerSettingsStore.getInstance();
      const enabled = await store.getSettingFromDatabase('maintenanceMode');

      const stub = sinon.stub(ServerSettingsStore.prototype, 'setSetting')
        .throws(new Error('Mock database error'));

      const res = await request(ctx.app)
        .put('/server-settings/maintenance-mode')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ enabled: !enabled });
      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');

      stub.restore();
      expect(store.getSetting('maintenanceMode')).to.equal(enabled);
      await expect(store.getSettingFromDatabase('maintenanceMode')).to.eventually.equal(enabled);
    });
  });
});
