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
import dinero from 'dinero.js';
import TransferRequest from '../../src/controller/request/transfer-request';
import TransferService from '../../src/service/transfer-service';

export default async function generateBalance(amount: number, toId: number) {
  const transferRequest: TransferRequest = {
    amount: {
      amount,
      precision: dinero.defaultPrecision,
      currency: dinero.defaultCurrency,
    },
    description: 'Magic',
    fromId: 0,
    toId,
  };
  await TransferService.postTransfer(transferRequest);
}

export function storeLDAPEnv(): { [key: string]: any; } {
  return {
    LDAP_SERVER_URL: process.env.LDAP_SERVER_URL,
    LDAP_BASE: process.env.LDAP_BASE,
    LDAP_USER_FILTER: process.env.LDAP_USER_FILTER,
    LDAP_BIND_USER: process.env.LDAP_BIND_USER,
    LDAP_BIND_PW: process.env.LDAP_BIND_PW,
    LDAP_SHARED_ACCOUNT_FILTER: process.env.LDAP_SHARED_ACCOUNT_FILTER,
    LDAP_ROLE_FILTER: process.env.LDAP_ROLE_FILTER,
    ENABLE_LDAP: process.env.ENABLE_LDAP,
    LDAP_USER_BASE: process.env.LDAP_USER_BASE,
  };
}

export function restoreLDAPEnv(ldapEnv:{ [key: string]: any; }) {
  process.env.LDAP_SERVER_URL = ldapEnv.LDAP_SERVER_URL;
  process.env.LDAP_BASE = ldapEnv.LDAP_BASE;
  process.env.LDAP_USER_FILTER = ldapEnv.LDAP_USER_FILTER;
  process.env.LDAP_BIND_USER = ldapEnv.LDAP_BIND_USER;
  process.env.LDAP_BIND_PW = ldapEnv.LDAP_BIND_PW;
  process.env.LDAP_SHARED_ACCOUNT_FILTER = ldapEnv.LDAP_SHARED_ACCOUNT_FILTER;
  process.env.LDAP_ROLE_FILTER = ldapEnv.LDAP_ROLE_FILTER;
  process.env.ENABLE_LDAP = ldapEnv.ENABLE_LDAP;
  process.env.LDAP_USER_BASE = ldapEnv.LDAP_USER_BASE;
}
