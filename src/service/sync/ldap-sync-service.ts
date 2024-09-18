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

import { SyncService } from './sync-service';
import User from '../../entity/user/user';
import { Client } from 'ldapts';

export default class LdapSyncService extends SyncService {

  private ldapClient: Client;

  constructor(ldapClient: Client) {
    super();
    this.ldapClient = ldapClient;
  }

  async sync(user: User): Promise<void> {
    // TODO: Implement LDAP syncing.
  }

  async import(): Promise<User[]> {
    // TODO: Implement LDAP importing.
    return [];
  }
}
