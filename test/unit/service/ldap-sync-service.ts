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

import { AppDataSource } from '../../../src/database/database';
import RoleManager from '../../../src/rbac/role-manager';
import LdapSyncService from '../../../src/service/sync/ldap-sync-service';
import UserSyncService from '../../../src/service/sync/user-sync-service';

describe('userSyncService', () => {
  it('should sync all users', async function test() {
    if (!process.env.ENABLE_LDAP || !process.env.LDAP_SERVER_URL) {
      console.log('Skipping LDAP sync tests');
      this.skip();
    }
    const appDataSource = await AppDataSource.initialize();
    const roleManager = await new RoleManager().initialize();

    const ldapSyncService = new LdapSyncService(roleManager, appDataSource.manager);
    const userSyncService = new UserSyncService([ldapSyncService]);
    await userSyncService.syncUsers();
    await userSyncService.fetch();
  });
});
