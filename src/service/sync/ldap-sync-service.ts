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
import User, { TermsOfServiceStatus, UserType } from '../../entity/user/user';
import { Client } from 'ldapts';
import ADService from '../ad-service';
import LDAPAuthenticator from '../../entity/authenticator/ldap-authenticator';
import RoleManager from '../../rbac/role-manager';
import { EntityManager } from 'typeorm';

export default class LdapSyncService extends SyncService {

  // We only sync organs and members.
  targets = [UserType.ORGAN, UserType.MEMBER];

  private readonly ldapClient: Client;

  private readonly roleManager: RoleManager;

  constructor(ldapClient: Client, roleManager: RoleManager, manager?: EntityManager) {
    super(manager);
    this.ldapClient = ldapClient;
    this.roleManager = roleManager;
  }

  async guard(user: User): Promise<boolean> {
    if (!await super.guard(user)) return false;

    // For members, we only sync if we have an LDAPAuthenticator
    if (user.type === UserType.MEMBER) {
      const ldapAuth = await this.manager.findOne(LDAPAuthenticator, { where: { user: { id: user.id } } });
      return !!ldapAuth;
    }
  }

  /**
   * Sync user based on LDAPAuthenticator.
   * Only organs are actually updated.
   * @param user
   */
  async sync(user: User): Promise<boolean> {
    const ldapAuth = await this.manager.findOne(LDAPAuthenticator, { where: { user: { id: user.id } } });
    if (!ldapAuth) return false;

    const ldapUser = await new ADService().getLDAPResponseFromGUID(this.ldapClient, ldapAuth.UUID);
    if (!ldapUser) return false;

    // We prefer syncing non-organs with the DB
    // However, we still return true to indicate that the user is "bound" to the LDAP
    if (user.type !== UserType.ORGAN) return true;

    user.firstName = ldapUser.displayName;
    user.lastName = '';
    user.canGoIntoDebt = false;
    user.acceptedToS = TermsOfServiceStatus.NOT_REQUIRED;
    user.active = true;

    return true;
  }

  async down(user: User): Promise<void> {
    const ldapAuth = await this.manager.findOne(LDAPAuthenticator, { where: { user: { id: user.id } } });
    if (!ldapAuth) return;
    console.error('Removing LDAPAuthenticator for user', user.id);
    await this.manager.delete(LDAPAuthenticator, { userId: user.id });
  }

  /**
   * LDAP fetch retrieves organs and user roles from AD.
   */
  async fetch(): Promise<User[]> {
    const adService = new ADService(this.manager);

    // syncSharedAccounts also creates accounts for all the members of the shared groups.
    // Is this something we want?
    await adService.syncSharedAccounts();

    // syncUserRoles also creates a new account of a user is assigned to a role but does not yet exist in sudosos.
    // Is this something we want?
    await adService.syncUserRoles(this.roleManager);

    return [];
  }
}
