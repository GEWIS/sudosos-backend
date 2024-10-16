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

/**
 * This is the module page of the ad-service.
 *
 * @module internal/ldap
 */

import { Client, EqualityFilter, SearchResult } from 'ldapts';
import { In } from 'typeorm';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';
import { bindUser, LDAPGroup, LDAPResponse, LDAPResult, LDAPUser, userFromLDAP } from '../helpers/ad';
import AuthenticationService from './authentication-service';
import RoleManager from '../rbac/role-manager';
import WithManager from '../database/with-manager';
import Bindings from '../helpers/bindings';

export default class ADService extends WithManager {

  /**
   * Creates and binds an Shared (Organ) group to an actual User
   * @param sharedUser - The group that needs an account.
   */
  async toSharedUser(sharedUser: LDAPGroup) {
    const acc = await this.manager.save(User, {
      firstName: sharedUser.displayName,
      lastName: '',
      type: UserType.ORGAN,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    });
    await bindUser(this.manager, sharedUser, acc);
  }

  /**
   * Create a new user account for the given service account.
   * @param serviceAccount
   */
  async toServiceAccount(serviceAccount: LDAPUser): Promise<User> {
    const account = await this.manager.save(User, {
      firstName: serviceAccount.displayName,
      lastName: '',
      type: UserType.INTEGRATION,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
      canGoIntoDebt: false,
    });

    await bindUser(this.manager, serviceAccount, account);
    return account;
  }

  /**
   * Creates an account for all new GUIDs
   * @param ldapUsers
   */
  public async createAccountIfNew(ldapUsers: LDAPUser[]) {
    const filtered = (await this.filterUnboundGUID(ldapUsers)) as LDAPUser[];
    for (const u of filtered) {
      await Bindings.onNewUserCreate()(u);
    }
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
   * Returns all objects with a GUID that is not in the LDAPAuthenticator table.
   * @param ldapResponses - Array to filter.
   */
  async filterUnboundGUID(ldapResponses: LDAPResponse[]) {
    const ids = ldapResponses.map((s) => s.objectGUID);
    const auths = await this.manager.find(LDAPAuthenticator, { where: { UUID: In(ids) }, relations: ['user'] });
    const existing = auths.map((l: LDAPAuthenticator) => l.UUID);

    // Use Buffer.compare to filter out existing GUIDs
    return ldapResponses.filter((response) =>
      !existing.some((uuid) => Buffer.compare(response.objectGUID, uuid) === 0),
    );
  }

  /**
   * Handles and updates a shared group
   * Gives authentications to the members of the shared group
   * @param client - The LDAP client
   * @param sharedAccount - Account to give access
   */
  async updateSharedAccountMembership(client: Client, sharedAccount: LDAPGroup): Promise<void> {
    const auth = await LDAPAuthenticator.findOne({ where: { UUID: sharedAccount.objectGUID }, relations: ['user'] });
    if (!auth) throw new Error('No authenticator found for shared account');

    // Get all the members of the shared account from AD
    const ldapMembers = (await this.getLDAPGroupMembers(client, sharedAccount.dn))
      .searchEntries.map((u) => userFromLDAP(u));

    // Turn the ldapMembers into SudoSOS users
    const members = await this.getUsers(ldapMembers, true);

    // Set the memberAuthenticator accordingly
    await new AuthenticationService(this.manager).setMemberAuthenticator(members, auth.user);
  }

  /**
   * Gives Users the correct role.
   *    Note that this creates Users if they do not exists in the LDAPAuth. table.
   * @param client
   * @param ldapRole - the AD entry linked to this role.
   * @param roleManager - Reference to the application role manager
   */
  async updateRoleMembership(client: Client, ldapRole: LDAPGroup, roleManager: RoleManager): Promise<void> {
    const ldapMembers = (await this.getLDAPGroupMembers(client, ldapRole.dn))
      .searchEntries.map((u) => userFromLDAP(u));

    // Turn the ldapMembers into SudoSOS users
    const members = await this.getUsers(ldapMembers, true);

    await roleManager.setRoleUsers(members, ldapRole.dn);
  }

  /**
   * Retrieves the LDAP entry matching the provided GUID, or undefined if there is none.
   *
   * @param client
   * @param guid
   */
  public async getLDAPResponseFromGUID(client: Client, guid: Buffer): Promise<LDAPUser | undefined> {
    const results = await client.search(process.env.LDAP_BASE, {
      filter: new EqualityFilter({
        attribute: 'objectGUID',
        value: guid,
      }),
      explicitBufferAttributes: ['objectGUID'],
    });

    if (results.searchEntries.length === 0)
      return undefined;

    return userFromLDAP(results.searchEntries[0] as any as LDAPResult);
  }

  /**
   * Gets all LDAP Users in the DN group
   * @param client - The LDAP Connection
   * @param dn - DN Of the group to get members of
   */
  public getLDAPGroupMembers(client: Client, dn: string):
  Promise<Pick<SearchResult, 'searchReferences'> & { searchEntries: LDAPResult[] }> {
    return client.search(process.env.LDAP_BASE, {
      filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${dn}))`,
      explicitBufferAttributes: ['objectGUID'],
    // This is because `search` returns the most generic response and we want to narrow it down.
    }) as any as Promise<Pick<SearchResult, 'searchReferences'> & { searchEntries: LDAPResult[] }>;
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
      console.error(error);
      return undefined;
    }
  }
}
