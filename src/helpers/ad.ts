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
 * This is the module page of the ad.
 *
 * @module helpers
 */

import { EntityManager } from 'typeorm';
import { Client } from 'ldapts';
import log4js, { Logger } from 'log4js';
import User from '../entity/user/user';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';

/**
 * Wrapper for the LDAP environment variables.
 */
export function getLDAPSettings() {
  return {
    url: process.env.LDAP_SERVER_URL,
    reader: process.env.LDAP_BIND_USER,
    readerPassword: process.env.LDAP_BIND_PW,
    base: process.env.LDAP_BASE,
    userFilter: process.env.LDAP_USER_FILTER,
  };
}

export interface LDAPResponse {
  objectGUID: Buffer,
  whenChanged: string,
}

export interface LDAPGroup extends LDAPResponse {
  displayName: string,
  dn: string,
  cn: string,
}

export interface LDAPUser {
  dn: string,
  whenChanged: string,
  memberOfFlattened: string[],
  givenName: string,
  sn: string,
  objectGUID: Buffer,
  mail: string,
  mNumber: number | undefined;
}

/**
 * Function that takes a valid ADUser response and binds it
 * to a existing User such that the AD user can authenticate as the existing user.
 * @param manager - Transaction manager.
 * @param ADUser - The AD user to bind.
 * @param user - The User to bind to.
 */
export async function bindUser(manager: EntityManager,
  ADUser: { objectGUID: Buffer }, user: User): Promise<LDAPAuthenticator> {
  return manager.save(LDAPAuthenticator, {
    user: user,
    UUID: ADUser.objectGUID,
  });
}

/**
 * Makes and bind an LDAP connection.
 */
export async function getLDAPConnection(): Promise<Client> {
  const logger: Logger = log4js.getLogger('LDAP');
  logger.level = process.env.LOG_LEVEL;

  const ldapSettings = getLDAPSettings();

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

export interface LDAPResult {
  dn: string,
  whenChanged: string,
  memberOfFlattened: string[],
  givenName: string,
  sn: string,
  objectGUID: Buffer,
  mail: string,
  employeeNumber: number | undefined;
}

/**
 * Wrapper for typing the untyped ldap result.
 * @param ldapResult - Search result to type
 */
export function userFromLDAP(ldapResult: LDAPResult): LDAPUser {
  const {
    dn, memberOfFlattened, givenName, sn,
    objectGUID, mail, employeeNumber, whenChanged,
  } = ldapResult;
  return {
    whenChanged,
    dn,
    memberOfFlattened,
    givenName,
    sn,
    objectGUID,
    mail,
    mNumber: employeeNumber,
  };
}
