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
import { getLDAPConnection, LDAPGroup, LDAPUser } from '../../helpers/ad';
import RBACService from '../rbac-service';
import log4js, { Logger } from 'log4js';

export default class LdapSyncService extends SyncService {

  // We only sync organs and members.
  targets = [UserType.ORGAN, UserType.MEMBER, UserType.INTEGRATION];

  private ldapClient: Client;

  private readonly roleManager: RoleManager;

  private logger: Logger = log4js.getLogger('AdSyncService');

  constructor(roleManager: RoleManager, manager?: EntityManager) {
    // Sanity check, since we already have a ldapClient
    if (!process.env.ENABLE_LDAP) throw new Error('LDAP is not enabled');

    super(manager);
    this.logger.level = process.env.LOG_LEVEL;
    this.roleManager = roleManager;
  }

  async guard(user: User): Promise<boolean> {
    if (!await super.guard(user)) return false;

    // For members, we only sync if we have an LDAPAuthenticator
    if (user.type === UserType.MEMBER) {
      const ldapAuth = await this.manager.findOne(LDAPAuthenticator, { where: { user: { id: user.id } } });
      return !!ldapAuth;
    }

    return true;
  }

  /**
   * Sync user based on LDAPAuthenticator.
   * Only organs are actually updated.
   * @param user
   */
  async sync(user: User): Promise<boolean> {
    const ldapAuth = await this.manager.findOne(LDAPAuthenticator, { where: { user: { id: user.id } } });
    if (!ldapAuth) return false;

    const ldapUser = await new ADService(this.manager).getLDAPResponseFromGUID(this.ldapClient, ldapAuth.UUID);
    if (!ldapUser) return false;

    // For members, we fetch user info from the GEWISDB
    // Therefore we do not need to update the user
    // But we do return true to indicate that the user is "bound" to the LDAP
    if (user.type === UserType.MEMBER) return true;

    this.logger.trace(`Updating user ${user} from LDAP.`);
    user.firstName = ldapUser.displayName;
    user.lastName = '';
    user.canGoIntoDebt = false;
    user.acceptedToS = TermsOfServiceStatus.NOT_REQUIRED;
    user.active = true;
    await this.manager.save(user);

    return true;
  }

  /**
   * Removes the LDAPAuthenticator for the given user.
   * @param user
   */
  async down(user: User): Promise<void> {
    this.logger.trace('Running down for user', user);
    const ldapAuth = await this.manager.findOne(LDAPAuthenticator, { where: { user: { id: user.id } } });
    if (ldapAuth) await this.manager.delete(LDAPAuthenticator, { userId: user.id });

    // For members, we only remove the authenticator.
    if (user.type === UserType.MEMBER) return;

    // For organs and integrations, we set the user to deleted and inactive.
    // TODO: closing organ active with non-zero balance?
    user.deleted = true;
    user.active = false;
    await this.manager.save(user);
  }


  /**
   * Fetches all shared accounts from AD and creates them in SudoSOS.
   * Also updates the membership of the shared accounts.
   * @param adService
   * @private
   */
  private async fetchSharedAccounts(adService: ADService): Promise<void> {
    this.logger.debug('Fetching shared accounts from LDAP');
    const sharedAccounts = await adService.getLDAPGroups<LDAPGroup>(
      this.ldapClient, process.env.LDAP_SHARED_ACCOUNT_FILTER);

    // If there are new shared accounts, we create them.
    const newSharedAccounts = (await adService.filterUnboundGUID(sharedAccounts)) as LDAPGroup[];
    this.logger.trace(`Found ${newSharedAccounts.length} new shared accounts`);
    for (const sharedAccount of newSharedAccounts) {
      await adService.toSharedUser(sharedAccount);
    }

    for (const sharedAccount of sharedAccounts) {
      await adService.updateSharedAccountMembership(this.ldapClient, sharedAccount);
    }
  }

  /**
   * Adds local users to roles based on AD membership.
   * Roles are matched using the CN of the AD group.
   *
   * If an AD user has a role but no account yet, the account is created.
   *
   * @param adService
   * @private
   */
  private async fetchUserRoles(adService: ADService): Promise<void> {
    this.logger.debug('Fetching user roles from LDAP');
    const roles = await adService.getLDAPGroups<LDAPGroup>(
      this.ldapClient, process.env.LDAP_ROLE_FILTER);
    if (!roles) return;

    const [dbRoles] = await RBACService.getRoles();
    const dbRoleNames = new Set(dbRoles.map((r) => r.name));

    const nonLocalRoles = roles.filter(ldapRole => !dbRoleNames.has(ldapRole.cn));
    nonLocalRoles.forEach(ldapRole => {
      this.logger.warn(`LDAP role ${ldapRole.cn} does not exist locally.`);
    });

    const localRoles = roles.filter(ldapRole => dbRoleNames.has(ldapRole.cn));
    this.logger.trace(`Found ${localRoles.length} local roles`);
    for (const ldapRole of localRoles) {
      await adService.updateRoleMembership(this.ldapClient, ldapRole, this.roleManager);
    }
  }

  /**
   * Fetches all service accounts from LDAP and creates them locally.
   *
   * @param adService
   * @private
   */
  private async fetchServiceAccounts(adService: ADService): Promise<void> {
    this.logger.debug('Fetching service accounts from LDAP');
    const serviceAccounts = (await adService.getLDAPGroupMembers(
      this.ldapClient, process.env.LDAP_SERVICE_ACCOUNT_FILTER)).searchEntries;

    const newServiceAccounts = await adService.filterUnboundGUID(serviceAccounts);
    this.logger.trace(`Found ${newServiceAccounts.length} new service accounts`);
    for (const serviceAccount of newServiceAccounts) {
      await adService.toServiceAccount(serviceAccount as LDAPUser);
    }
  }

  /**
   * LDAP fetch retrieves organs, service accounts, and user roles from AD.
   */
  async fetch(): Promise<void> {
    this.logger.trace('Fetching LDAP data');
    const adService = new ADService(this.manager);

    if (!process.env.LDAP_SHARED_ACCOUNT_FILTER) {
      this.logger.warn('LDAP_SHARED_ACCOUNT_FILTER is not set, skipping shared accounts');
    } else {
      await this.fetchSharedAccounts(adService);
    }

    if (!process.env.LDAP_ROLE_FILTER) {
      this.logger.warn('LDAP_ROLE_FILTER is not set, skipping user roles');
    } else {
      await this.fetchUserRoles(adService);
    }

    if (!process.env.LDAP_SERVICE_ACCOUNT_FILTER) {
      this.logger.warn('LDAP_SERVICE_ACCOUNT_FILTER is not set, skipping service accounts');
    } else {
      await this.fetchServiceAccounts(adService);
    }
  }

  async pre(): Promise<void> {
    this.ldapClient = await getLDAPConnection();
  }

  async post(): Promise<void> {
    await this.ldapClient.unbind();
  }
}
