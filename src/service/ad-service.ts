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

interface SharedUser {
  objectGUID: string,
  displayName: string,
  dn: string,
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
  private static async toSharedUser(manager: EntityManager, sharedUser: SharedUser) {
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
   * Gives access to a shared account for a list of LDAPUsers.
   * @param user - The user to give access
   * @param ldapUsers - The users to gain access
   */
  private static async setSharedUsers(user: User, ldapUsers: LDAPUser[]) {
    // Extract all accounts from GUIDs.
    const ldapUserUIDs = ldapUsers.map((u) => u.objectGUID);
    const members: User[] = (await LDAPAuthenticator.find({ where: ldapUserUIDs.map((UUID) => ({ UUID })), relations: ['user'] })).map((u) => u.user);

    // Give accounts access to the shared user.
    await wrapInManager(AuthenticationService.setMemberAuthenticator)(members, user);
  }

  /**
   * Syncs all the shared account and access with AD.
   */
  public static async syncSharedAccounts() {
    if (!process.env.LDAP_SERVER_URL) return;
    const client = await this.getLDAPConnection();

    const sharedAccounts = await this.getSharedAccounts(client);
    const ids = sharedAccounts.map((s) => s.objectGUID);

    // Filter on un-bound groups
    const existing = (await LDAPAuthenticator.findByIds(ids)).map((l) => l.UUID);
    const unexisting = sharedAccounts
      .filter((account) => existing.indexOf(account.objectGUID) === -1);

    // Create shared for all new groups
    if (unexisting.length !== 0) {
      const promises: Promise<any>[] = [];
      unexisting.forEach((newAccount) => {
        promises.push(wrapInManager(ADService.toSharedUser)(newAccount));
      });

      await Promise.all(promises);
    }

    // Give members of the group access to the shared users.
    const promises: Promise<any>[] = [];

    sharedAccounts.forEach((shared) => {
      // Extract members
      promises.push(client.search(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${shared.dn}))`,
      }).then(async (result) => {
        const members: LDAPUser[] = result.searchEntries.map((u) => ADService.userFromLDAP(u));
        await LDAPAuthenticator.findOne({ where: { UUID: shared.objectGUID }, relations: ['user'] }).then(async (auth) => {
          if (auth) await ADService.setSharedUsers(auth.user, members);
        });
      }));
    });

    await Promise.all(promises);
  }

  /**
   * Returns all groups in the LDAP_SHARED_ACCOUNT_FILTER AD Base
   */
  public static async getSharedAccounts(client: Client): Promise<SharedUser[] | undefined> {
    try {
      const { searchEntries } = await client.search(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
        filter: '(CN=*)',
      });
      return searchEntries.map((e) => (e as any) as SharedUser);
    } catch (error) {
      return undefined;
    }
  }
}
