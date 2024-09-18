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

import { Client } from 'ldapts';
import { In } from 'typeorm';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';
import { bindUser, getLDAPConnection, LDAPGroup, LDAPResponse, LDAPResult, LDAPUser, userFromLDAP } from '../helpers/ad';
import AuthenticationService from './authentication-service';
import Bindings from '../helpers/bindings';
import RoleManager from '../rbac/role-manager';
import RBACService from './rbac-service';
import WithManager from '../database/with-manager';

export default class ADService extends WithManager {
  /**
   * Creates and binds an Shared (Organ) group to an actual User
   * @param sharedUser - The group that needs an account.
   */
  private async toSharedUser(sharedUser: LDAPGroup) {
    const account = Object.assign(new User(), {
      firstName: sharedUser.displayName,
      lastName: '',
      type: UserType.ORGAN,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    }) as User;

    const acc = await this.manager.save(account);
    await bindUser(this.manager, sharedUser, acc);
  }

  /**
   * Creates an account for all new GUIDs
   * @param ldapUsers
   */
  public async createAccountIfNew(ldapUsers: LDAPUser[]) {
    const filtered = await this.filterUnboundGUID(ldapUsers);
    const createUser = async (ADUsers: LDAPUser[]): Promise<any> => {
      const promises: Promise<User>[] = [];
      ADUsers.forEach((u) => promises.push(Bindings.ldapUserCreation()(u)));
      await Promise.all(promises);
    };
    await createUser(filtered as LDAPUser[]);
  }

  /**
   * This function returns all user objects related to the provided ldapUsers
   * If createIfNew is true it will create users for all unbounded ldapUsers.
   * @param ldapUsers - LDAP user object to get users for.
   * @param createIfNew - Boolean if unknown users should be created.
   */
  public async getUsers(ldapUsers: LDAPUser[],
    createIfNew = false): Promise<User[]> {
    if (createIfNew) await this.createAccountIfNew(ldapUsers);
    const uuids = ldapUsers.map((u) => (u.objectGUID));
    const authenticators = await this.manager.find(LDAPAuthenticator, { where: { UUID: In(uuids) }, relations: ['user'] });
    return authenticators.map((u) => u.user);
  }

  /**
   * Gives access to a shared account for a list of LDAPUsers.
   * @param user - The user to give access
   * @param ldapUsers - The users to gain access
   */
  private async setSharedUsers(user: User, ldapUsers: LDAPUser[]) {
    const members = await this.getUsers(ldapUsers, true);
    // Give accounts access to the shared user.
    await new AuthenticationService(this.manager).setMemberAuthenticator(members, user);
  }

  /**
   * Returns all objects with a GUID that is not in the LDAPAuthenticator table.
   * @param ldapResponses - Array to filter.
   */
  private async filterUnboundGUID(ldapResponses: LDAPResponse[]) {
    const ids = ldapResponses.map((s) => s.objectGUID);
    const auths = await this.manager.find(LDAPAuthenticator, { where: { UUID: In(ids) }, relations: ['user'] });
    const existing = auths.map((l: LDAPAuthenticator) => l.UUID);

    // Use Buffer.compare to filter out existing GUIDs
    const filtered = ldapResponses.filter((response) =>
      !existing.some((uuid) => Buffer.compare(response.objectGUID, uuid) === 0),
    );

    return filtered;
  }

  /**
   * Handles and updates a shared group
   * Gives authentications to the members of the shared group
   * @param client - The LDAP client
   * @param sharedAccounts - Accounts to give access
   */
  private async handleSharedGroups(client: Client, sharedAccounts: LDAPGroup[]) {
    for (let i = 0; i < sharedAccounts.length; i += 1) {
      // Extract members
      const shared = sharedAccounts[i];
      const result = await this.getLDAPGroupMembers(client, shared.dn);
      const members: LDAPUser[] = result.searchEntries.map((u) => userFromLDAP(u as any as LDAPResult));
      const auth = await LDAPAuthenticator.findOne({ where: { UUID: shared.objectGUID }, relations: ['user'] });
      if (auth) await this.setSharedUsers(auth.user, members);
    }
  }

  /**
   * Helper function to prevent transactions in transactions
   * @param responses
   * @private
   */
  private async createSharedFromArray(responses: LDAPGroup[]) {
    const promises: Promise<void>[] = [];
    responses.forEach((r) => promises.push(this.toSharedUser(r)));
    await Promise.all(promises);
  }

  /**
   * Syncs all the shared account and access with AD.
   */
  public async syncSharedAccounts() {
    if (!process.env.ENABLE_LDAP) return;
    const client = await getLDAPConnection();

    const sharedAccounts = await this.getLDAPGroups<LDAPGroup>(
      client, process.env.LDAP_SHARED_ACCOUNT_FILTER,
    );

    const unexisting = (await this.filterUnboundGUID(sharedAccounts)) as LDAPGroup[];

    // Makes new Shared Users for all new shared users.
    await this.createSharedFromArray(unexisting);

    // Adds users to the shared groups.
    await this.handleSharedGroups(client, sharedAccounts);
  }

  /**
   * Gives Users the correct role.
   *    Note that this creates Users if they do not exists in the LDAPAuth. table.
   * @param roleManager - Reference to the application role manager
   * @param role - Name of the role
   * @param users - LDAPUsers to give the role to
   */
  public async addUsersToRole(roleManager: RoleManager,
    role: string, users: LDAPUser[]) {
    const members = await this.getUsers(users, true);
    await roleManager.setRoleUsers(members, role);
  }

  /**
   * Function that handles the updating of the AD roles as returned by the AD Query
   * @param roleManager - Reference to the application role manager
   * @param client - LDAP Client connection
   * @param ldapRoles - Roles returned from LDAP
   */
  private async handleADRoles(roleManager: RoleManager,
    client: Client, ldapRoles: LDAPGroup[]) {
    const [dbRoles] = await RBACService.getRoles();
    for (let i = 0; i < ldapRoles.length; i += 1) {
      const ldapRole = ldapRoles[i];

      // The LDAP role should also exist in SudoSOS
      if (dbRoles.some((r) => r.name === ldapRole.cn)) {
        const result = await this.getLDAPGroupMembers(client, ldapRole.dn);
        const members: LDAPUser[] = result.searchEntries.map((u) => userFromLDAP(u as any as LDAPResult));
        await this.addUsersToRole(roleManager, ldapRole.cn, members);
      }
    }
  }

  /**
   * Sync User Roles from AD
   * @param roleManager - Reference to the application role manager
   */
  public async syncUserRoles(roleManager: RoleManager) {
    if (!process.env.ENABLE_LDAP) return;
    const client = await getLDAPConnection();

    const roles = await this.getLDAPGroups<LDAPGroup>(client, process.env.LDAP_ROLE_FILTER);
    if (!roles) return;

    await this.handleADRoles(roleManager, client, roles);
  }

  /**
   * Sync all Users from AD and create account if needed.
   */
  public async syncUsers() {
    if (!process.env.ENABLE_LDAP) return;
    const client = await getLDAPConnection();

    const { searchEntries } = await this.getLDAPGroupMembers(client,
      process.env.LDAP_USER_BASE);
    const users = searchEntries.map((entry) => userFromLDAP(entry as any as LDAPResult));
    await this.getUsers(users, true);
  }

  /**
   * Gets all LDAP Users in the DN group
   * @param client - The LDAP Connection
   * @param dn - DN Of the group to get members of
   */
  public getLDAPGroupMembers(client: Client, dn: string) {
    return client.search(process.env.LDAP_BASE, {
      filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${dn}))`,
      explicitBufferAttributes: ['objectGUID'],
    });
  }

  /**
   * Gets all LDAP Groups in the given baseDN
   * @param client - The LDAP Connection
   * @param baseDN - Base DN to search in
   */
  public async getLDAPGroups<T>(client: Client, baseDN: string): Promise<T[] | undefined> {
    try {
      const { searchEntries } = await client.search(baseDN, {
        filter: '(CN=*)',
        explicitBufferAttributes: ['objectGUID'],
      });
      return searchEntries.map((e) => (e as any) as T);
    } catch (error) {
      return undefined;
    }
  }
}
