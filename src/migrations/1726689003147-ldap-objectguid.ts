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
 * @hidden
 */

import { In, MigrationInterface, Not, QueryRunner } from 'typeorm';
import { getLDAPConnection, LDAPResult } from '../helpers/ad';
import ADService from '../service/ad-service';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import { UserType } from '../entity/user/user';

export class LDAPObjectGUID1726689003147 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if ENV vars are set
    if (!process.env.LDAP_BASE || !process.env.LDAP_USER_BASE || !process.env.LDAP_SHARED_ACCOUNT_FILTER) {
      console.log('LDAP_BASE, LDAP_USER_BASE, LDAP_SHARED_ACCOUNT_FILTER must be for the migration to work, skipping.');
      return;
    }

    // Get LDAP connection
    const client = await getLDAPConnection();
    const adService = new ADService();

    const oldUsers = await client.search(process.env.LDAP_BASE, {
      filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${process.env.LDAP_USER_BASE}))`,
    });

    const oldOrgans = await client.search(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
      filter: '(CN=*)',
    });

    const oldGUIDs = [...oldUsers.searchEntries, ...oldOrgans.searchEntries].map((entry: any) => ({
      dn: entry.dn,
      objectGUID: entry.objectGUID,
    }));

    // Create a map of cn to old objectGUID
    const oldGUIDMap = new Map(oldGUIDs.map(({ dn, objectGUID }) => [dn, objectGUID]));

    // Fetch new LDAP users to get new objectGUIDs
    const newUsers = await adService.getLDAPGroupMembers(client, process.env.LDAP_USER_BASE);

    const newOrgans = await adService.getLDAPGroups<LDAPResult>(client, process.env.LDAP_SHARED_ACCOUNT_FILTER);

    const newGUIDs = [...newUsers.searchEntries, ...newOrgans].map((entry: any) => ({
      dn: entry.dn,
      objectGUID: entry.objectGUID,
    }));

    // Create a map of cn to new objectGUID
    const newGUIDMap = new Map(newGUIDs.map(({ dn, objectGUID }) => [dn, objectGUID]));

    const membersToFix = new Set<number>();
    await queryRunner.manager.find(LDAPAuthenticator, { where: { user: { type: UserType.MEMBER } } }).then((auths) => {
      auths.forEach((auth) => {
        membersToFix.add(auth.userId);
      });
    });

    const otherToFix = new Set<number>();
    await queryRunner.manager.find(LDAPAuthenticator, { where: { user: { type: Not(UserType.MEMBER) } } }).then((auths) => {
      auths.forEach((auth) => {
        otherToFix.add(auth.userId);
      });
    });


    for (const [dn, objectGUID] of oldGUIDMap) {
      console.info(`Checking ${dn}`);
      const auth = await queryRunner.manager.findOne(LDAPAuthenticator, {
        where: { UUID: objectGUID },
      });
      if (!auth) throw new Error(`Could not find LDAPAuthenticator for ${dn}`);
      const newObjectGUID = newGUIDMap.get(dn);
      if (!newObjectGUID) throw new Error(`Could not find new objectGUID for ${dn}`);

      console.error(auth.UUID, newObjectGUID);
      membersToFix.delete(auth.userId);
      otherToFix.delete(auth.userId);
    }

    if (membersToFix.size > 0) {
      // These AD accounts have been unlinked and can be removed
      const ids = Array.from(membersToFix.values());
      console.error('Removing old LDAPAuthenticators:', ids);
      await queryRunner.manager.delete(LDAPAuthenticator, { userId: In(ids) });
    }

    if (otherToFix.size > 0) {
      console.error('Others to fix:', otherToFix);
      throw new Error('Not all users have been fixed');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    // no-op
  }

}
