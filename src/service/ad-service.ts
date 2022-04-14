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
import log4js, { Logger } from 'log4js';
import { EntityManager } from 'typeorm';
import LDAPAuthenticator, { LDAPUser } from '../entity/authenticator/ldap-authenticator';
import User, { UserType } from '../entity/user/user';
import wrapInManager from '../helpers/database';
// eslint-disable-next-line import/no-cycle
import AuthenticationService from './authentication-service';
// eslint-disable-next-line import/no-cycle
import Gewis from '../gewis/gewis';

interface LDAPResponse {
  objectGUID: string,
}

export interface LDAPGroup extends LDAPResponse {
  displayName: string,
  dn: string,
  cn: string,
}

export default class ADService {
  /**
   * Wrapper for the LDAP environment variables.
   */
  public static getLDAPSettings() {
    return {
      url: process.env.LDAP_SERVER_URL,
      reader: process.env.LDAP_BIND_USER,
      readerPassword: process.env.LDAP_BIND_PW,
      base: process.env.LDAP_BASE,
      userFilter: process.env.LDAP_USER_FILTER,
    };
  }

  /**
   * Wrapper for typing the untyped ldap result.
   * @param ldapResult - Search result to type
   */
  public static userFromLDAP(ldapResult: any): LDAPUser {
    const {
      dn, memberOfFlattened, givenName, sn,
      objectGUID, sAMAccountName, mail, employeeNumber,
    } = ldapResult;
    return {
      dn,
      memberOfFlattened,
      givenName,
      sn,
      objectGUID,
      sAMAccountName,
      mail,
      mNumber: employeeNumber,
    };
  }

  /**
   * Function that takes a valid ADUser response and binds it
   * to a existing User such that the AD user can authenticate as the existing user.
   * @param manager - Transaction manager.
   * @param ADUser - The AD user to bind.
   * @param user - The User to bind to.
   */
  public static async bindUser(manager: EntityManager, ADUser: { objectGUID: string }, user: User)
    : Promise<LDAPAuthenticator> {
    const auth = Object.assign(new LDAPAuthenticator(), {
      user,
      UUID: ADUser.objectGUID,
    }) as LDAPAuthenticator;
    await manager.save(auth);
    return auth;
  }

  /**
   * Makes and bind an LDAP connection.
   */
  public static async getLDAPConnection(): Promise<Client> {
    const logger: Logger = log4js.getLogger('LDAP');
    logger.level = process.env.LOG_LEVEL;

    const ldapSettings = ADService.getLDAPSettings();

    const client = new Client({
      url: ldapSettings.url,
    });

    // Bind LDAP Reader
    try {
      await client.bind(ldapSettings.reader, ldapSettings.readerPassword);
    } catch (error) {
      logger.error(`Could not bind LDAP reader: ${ldapSettings.reader} err: ${String(error)}`);
      return undefined;
    }

    return client;
  }

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
      await ADService.bindUser(manager, sharedUser, acc);
    });
  }

  /**
   * Creates an account for all new GUIDs
   * @param ldapUsers
   */
  public static async createAccountIfNew(ldapUsers: LDAPUser[]) {
    const filtered = await this.filterUnboundGUID(ldapUsers);
    const createUser = async (manager: EntityManager, ADUsers: LDAPUser[]): Promise<any> => {
      ADUsers.forEach((u) => Gewis.findOrCreateGEWISUserAndBind(manager, u));
    };
    await wrapInManager(createUser)(filtered);
  }

  /**
   * This function returns all user objects related to the provided ldapUsers
   * If createIfNew is true it will create users for all unbounded ldapUsers.
   * @param ldapUser - LDAP user object to get users for.
   * @param createIfNew - Boolean if unknown users should be created.
   */
  public static async getUsers(ldapUsers: LDAPUser[], createIfNew = false): Promise<User[]> {
    if (createIfNew) await this.createAccountIfNew(ldapUsers);
    const authenticators = (await LDAPAuthenticator.find({ where: ldapUsers.map((u) => ({ UUID: u.objectGUID })), relations: ['user'] }));
    return authenticators.map((u) => u.user);
  }

  /**
   * Gives access to a shared account for a list of LDAPUsers.
   * @param user - The user to give access
   * @param ldapUsers - The users to gain access
   */
  private static async setSharedUsers(user: User, ldapUsers: LDAPUser[]) {
    const members = this.getUsers(ldapUsers, true);
    // Give accounts access to the shared user.
    await wrapInManager(AuthenticationService.setMemberAuthenticator)(members, user);
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
  private static async handleSharedGroups(client: Client, sharedAccounts: LDAPGroup[]) {
    const promises: Promise<void>[] = [];

    sharedAccounts.forEach((shared) => {
      // Extract members
      promises.push(this.getLDAPGroupMembers(client, shared.dn).then(async (result) => {
        const members: LDAPUser[] = result.searchEntries.map((u) => ADService.userFromLDAP(u));
        await LDAPAuthenticator.findOne({ where: { UUID: shared.objectGUID }, relations: ['user'] }).then(async (auth) => {
          if (auth) await ADService.setSharedUsers(auth.user, members);
        });
      }));
    });

    await Promise.all(promises);
  }

  /**
   * Syncs all the shared account and access with AD.
   */
  public static async syncSharedAccounts() {
    if (!process.env.LDAP_SERVER_URL) return;
    const client = await this.getLDAPConnection();

    const sharedAccounts = await this.getLDAPGroups<LDAPGroup>(
      client, process.env.LDAP_SHARED_ACCOUNT_FILTER,
    );

    const unexisting = await this.filterUnboundGUID(sharedAccounts);

    // Makes new Shared Users for all new shared users.
    await this.asyncForEach<LDAPResponse>(unexisting, wrapInManager(ADService.toSharedUser));

    // Adds users to the shared groups.
    await this.handleSharedGroups(client, sharedAccounts);
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
