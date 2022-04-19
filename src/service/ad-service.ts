/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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

import { Client } from 'ldapts';
import { EntityManager } from 'typeorm';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import User, { UserType } from '../entity/user/user';
import wrapInManager from '../helpers/database';
import {
  bindUser, getLDAPConnection, LDAPGroup, LDAPResponse, LDAPUser, userFromLDAP,
} from '../helpers/ad';
import AuthenticationService from './authentication-service';
import Bindings from '../helpers/bindings';
import RoleManager from '../rbac/role-manager';

export default class ADService {
  /**
   * Creates and binds an Shared (Organ) group to an actual User
   * @param manager - Transaction Manager.
   * @param sharedUser - The group that needs an account.
   */
  private static async toSharedUser(manager: EntityManager, sharedUser: LDAPGroup) {
    const account = Object.assign(new User(), {
      firstName: sharedUser.displayName,
      lastName: '',
      type: UserType.ORGAN,
      active: true,
    }) as User;

    await manager.save(account).then(async (acc) => {
      await bindUser(manager, sharedUser, acc);
    });
  }

  /**
   * Creates an account for all new GUIDs
   * @param ldapUsers
   */
  public static async createAccountIfNew(manager: EntityManager, ldapUsers: LDAPUser[]) {
    const filtered = await this.filterUnboundGUID(ldapUsers);
    const createUser = async (ADUsers: LDAPUser[]): Promise<any> => {
      ADUsers.forEach((u) => Bindings.ldapUserCreation(manager, u));
    };
    await createUser(filtered as LDAPUser[]);
  }

  /**
   * This function returns all user objects related to the provided ldapUsers
   * If createIfNew is true it will create users for all unbounded ldapUsers.
   * @param ldapUsers - LDAP user object to get users for.
   * @param createIfNew - Boolean if unknown users should be created.
   */
  public static async getUsers(manager: EntityManager, ldapUsers: LDAPUser[],
    createIfNew = false): Promise<User[]> {
    if (createIfNew) await this.createAccountIfNew(manager, ldapUsers);
    const authenticators = (await LDAPAuthenticator.find({ where: ldapUsers.map((u) => ({ UUID: u.objectGUID })), relations: ['user'] }));
    return authenticators.map((u) => u.user);
  }

  /**
   * Gives access to a shared account for a list of LDAPUsers.
   * @param user - The user to give access
   * @param ldapUsers - The users to gain access
   */
  private static async setSharedUsers(manager: EntityManager, user: User, ldapUsers: LDAPUser[]) {
    const members = await this.getUsers(manager, ldapUsers, true);
    // Give accounts access to the shared user.
    await AuthenticationService.setMemberAuthenticator(manager, members, user);
  }

  /**
   * Returns all objects with a GUID that is not in the LDAPAuthenticator table.
   * @param ldapResponses - Array to filter.
   */
  private static async filterUnboundGUID(ldapResponses: LDAPResponse[]) {
    const ids = ldapResponses.map((s) => s.objectGUID);
    const auths = (await LDAPAuthenticator.find({ where: ids.map((UUID) => ({ UUID })), relations: ['user'] }));
    const existing = auths.map((l) => l.UUID);

    return ldapResponses
      .filter((response) => existing.indexOf(response.objectGUID) === -1);
  }

  /**
   * Wrapper function for async for each on arrays.
   */
  private static async asyncForEach<T>(arr: T[], mapper: (item: T) => Promise<any>) {
    const collect: any[] = [];
    if (arr.length !== 0) {
      const promises: Promise<any>[] = [];
      arr.forEach((i) => {
        promises.push(mapper(i).then((res) => collect.push(res)));
      });

      await Promise.all(promises);
    }
    return collect;
  }

  /**
   * Handles and updates a shared group
   * Gives authentications to the members of the shared group
   * @param client - The LDAP client
   * @param sharedAccounts - Accounts to give access
   */
  private static async handleSharedGroups(manager: EntityManager,
    client: Client, sharedAccounts: LDAPGroup[]) {
    const promises: Promise<void>[] = [];

    sharedAccounts.forEach((shared) => {
      // Extract members
      promises.push(ADService.getLDAPGroupMembers(client, shared.dn).then(async (result) => {
        const members: LDAPUser[] = result.searchEntries.map((u) => userFromLDAP(u));
        await LDAPAuthenticator.findOne({ where: { UUID: shared.objectGUID }, relations: ['user'] }).then(async (auth) => {
          if (auth) await ADService.setSharedUsers(manager, auth.user, members);
        });
      }));
    });

    await Promise.all(promises);
  }

  /**
   * Syncs all the shared account and access with AD.
   */
  public static async syncSharedAccounts() {
    if (!process.env.ENABLE_LDAP) return;
    const client = await getLDAPConnection();

    const sharedAccounts = await this.getLDAPGroups<LDAPGroup>(
      client, process.env.LDAP_SHARED_ACCOUNT_FILTER,
    );

    const unexisting = await this.filterUnboundGUID(sharedAccounts);

    // Makes new Shared Users for all new shared users.
    await this.asyncForEach<LDAPResponse>(unexisting, wrapInManager(ADService.toSharedUser));

    // Adds users to the shared groups.
    await wrapInManager(ADService.handleSharedGroups)(client, sharedAccounts);
  }

  /**
   * Gives Users the correct role.
   *    Note that this creates Users if they do not exists in the LDAPAuth. table.
   * @param roleManager - Reference to the application role manager
   * @param role - Name of the role
   * @param users - LDAPUsers to give the role to
   */
  public static async addUsersToRole(manager: EntityManager, roleManager: RoleManager,
    role: string, users: LDAPUser[]) {
    const members = await ADService.getUsers(manager, users, true);
    await roleManager.setRoleUsers(members, role);
  }

  /**
   * Function that handles the updating of the AD roles as returned by the AD Query
   * @param roleManager - Reference to the application role manager
   * @param client - LDAP Client connection
   * @param roles - Roles returned from LDAP
   */
  private static async handleADRoles(manager: EntityManager, roleManager: RoleManager,
    client: Client, roles: LDAPGroup[]) {
    const promises: Promise<any>[] = [];
    roles.forEach((role) => {
      if (roleManager.containsRole(role.cn)) {
        promises.push(ADService.getLDAPGroupMembers(client, role.dn).then(async (result) => {
          const members: LDAPUser[] = result.searchEntries.map((u) => userFromLDAP(u));
          await ADService.addUsersToRole(manager, roleManager, role.cn, members);
        }));
      }
    });

    await Promise.all(promises);
  }

  /**
   * Sync User Roles from AD
   * @param roleManager - Reference to the application role manager
   */
  public static async syncUserRoles(roleManager: RoleManager) {
    if (!process.env.ENABLE_LDAP) return;
    const client = await getLDAPConnection();

    const roles = await ADService.getLDAPGroups<LDAPGroup>(client, process.env.LDAP_ROLE_FILTER);
    if (!roles) return;

    await wrapInManager(ADService.handleADRoles)(roleManager, client, roles);
  }

  /**
   * Sync all Users from AD and create account if needed.
   */
  public static async syncUsers() {
    if (!process.env.ENABLE_LDAP) return;
    const client = await getLDAPConnection();

    const { searchEntries } = await ADService.getLDAPGroupMembers(client, 'CN=PRIV - SudoSOS Users,OU=SudoSOS Roles,OU=Groups,DC=gewiswg,DC=gewis,DC=nl');
    const users = searchEntries.map((entry) => userFromLDAP(entry));
    wrapInManager(ADService.getUsers)(users, true);
  }

  /**
   * Gets all LDAP Users in the DN group
   * @param client - The LDAP Connection
   * @param dn - DN Of the group to get members of
   */
  public static async getLDAPGroupMembers(client: Client, dn: string) {
    return client.search(process.env.LDAP_BASE, {
      filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${dn}))`,
    });
  }

  /**
   * Gets all LDAP Groups in the given baseDN
   * @param client - The LDAP Connection
   * @param baseDN - Base DN to search in
   */
  public static async getLDAPGroups<T>(client: Client, baseDN: string): Promise<T[] | undefined> {
    try {
      const { searchEntries } = await client.search(baseDN, {
        filter: '(CN=*)',
      });
      return searchEntries.map((e) => (e as any) as T);
    } catch (error) {
      return undefined;
    }
  }
}
