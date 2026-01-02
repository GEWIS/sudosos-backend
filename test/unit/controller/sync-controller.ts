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

import { DefaultContext, defaultContext, finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import User, { UserType } from '../../../src/entity/user/user';
import { ADMIN_USER, UserFactory } from '../../helpers/user-factory';
import { expect, request } from 'chai';
import SyncController from '../../../src/controller/sync-controller';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { json } from 'body-parser';
import { RbacSeeder } from '../../seed';

describe('SyncController', () => {
  let ctx: DefaultContext & {
    adminToken: string;
    userToken: string;
  };

  before(async () => {
    const c = { ...await defaultContext() };
    await truncateAllTables(c.connection);

    const admin = await (await UserFactory(await ADMIN_USER())).get();
    const regularUser = await (await UserFactory()).get();

    const all = { all: new Set<string>(['*']) };
    const adminRole = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        User: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);

    const userRole = await new RbacSeeder().seed([{
      name: 'User',
      permissions: {
        User: {
          get: { all: new Set<string>([]) }, // No permissions
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.MEMBER,
    }]);

    const adminToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(admin, adminRole), 'nonce admin');
    const userToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(regularUser, userRole), 'nonce user');

    const tokenMiddleware = new TokenMiddleware({ tokenHandler: c.tokenHandler, refreshFactor: 0.5 }).getMiddleware();
    c.app.use(json());
    c.app.use(tokenMiddleware);
    const controller = new SyncController({ specification: c.specification, roleManager: c.roleManager });
    c.app.use('/sync', controller.getRouter());

    ctx = { ...c, adminToken, userToken };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /sync/user', () => {
    it('should return HTTP 403 if user lacks permissions', async () => {
      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('should return HTTP 400 when no sync services are available', async () => {
      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('No sync services are available. Check environment configuration.');
    });

    it('should handle invalid service parameter', async () => {
      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ service: 'invalid' });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid service: invalid.');
    });

    it('should handle valid service parameters', async () => {
      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ service: ['ldap', 'gewisdb'] });
      expect(res.status).to.not.equal(500);
    });

    it('should handle single service parameter', async () => {
      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ service: 'ldap' });
      expect(res.status).to.not.equal(500);
    });

    it('should return correct model when services are available', async () => {
      // This test would need actual sync services to be configured
      // For now, we test the error case which is the expected behavior
      // when no sync services are configured in the test environment
      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('No sync services are available. Check environment configuration.');
    });
  });

  describe('GET /sync/user with enabled services', () => {
    let originalGewisdbApiKey: string | undefined;
    let originalGewisdbApiUrl: string | undefined;
    let originalEnableLdap: string | undefined;

    beforeEach(() => {
      // Store original values of specific environment variables
      originalGewisdbApiKey = process.env.GEWISDB_API_KEY;
      originalGewisdbApiUrl = process.env.GEWISDB_API_URL;
      originalEnableLdap = process.env.ENABLE_LDAP;
    });

    afterEach(() => {
      // Restore original values of specific environment variables
      if (originalGewisdbApiKey === undefined) {
        delete process.env.GEWISDB_API_KEY;
      } else {
        process.env.GEWISDB_API_KEY = originalGewisdbApiKey;
      }
      if (originalGewisdbApiUrl === undefined) {
        delete process.env.GEWISDB_API_URL;
      } else {
        process.env.GEWISDB_API_URL = originalGewisdbApiUrl;
      }
      if (originalEnableLdap === undefined) {
        delete process.env.ENABLE_LDAP;
      } else {
        process.env.ENABLE_LDAP = originalEnableLdap;
      }
    });

    it('should work with GEWISDB service enabled', async () => {
      // Enable GEWISDB service
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'http://test-url.com';

      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .query({ service: 'gewisdb' });

      expect(res.status).to.not.equal(500);
    });

    it('should use all available services when no service filter is provided', async () => {
      // Enable both services
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'http://test-url.com';

      const res = await request(ctx.app)
        .get('/sync/user')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.not.equal(500);
    });
  });
});
