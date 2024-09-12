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

import dinero from 'dinero.js';
import express, { Express } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import TransferRequest from '../../src/controller/request/transfer-request';
import TransferService from '../../src/service/transfer-service';
import Swagger from '../../src/start/swagger';
import RoleManager from '../../src/rbac/role-manager';
import Database from '../../src/database/database';
import TokenHandler from '../../src/authentication/token-handler';
import User, { UserType } from '../../src/entity/user/user';
import { ADMIN_USER, UserFactory } from './user-factory';
import { truncateAllTables } from '../setup';
import ServerSettingsStore from '../../src/server-settings/server-settings-store';

export interface DefaultContext {
  app: Express,
  specification: SwaggerSpecification,
  roleManager: RoleManager,
  connection: DataSource,
  tokenHandler: TokenHandler,
}

export async function defaultContext(): Promise<DefaultContext> {
  const app = express();
  const specification = await Swagger.initialize(app);
  const roleManager = new RoleManager();
  const connection = await Database.initialize();
  const tokenHandler = new TokenHandler({
    algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
  });
  return {
    app,
    specification,
    roleManager,
    connection,
    tokenHandler,
  };
}

export async function defaultBefore(): Promise<DefaultContext> {
  const ctx = await defaultContext();
  await truncateAllTables(ctx.connection);
  return ctx;
}

//
export async function finishTestDB(connection: DataSource) {
  await truncateAllTables(connection);
  ServerSettingsStore.deleteInstance();
  // Only drop in sqlite. If really wanted otherwise, do the call directly on the connection.
  if (process.env.TYPEORM_CONNECTION === 'sqlite') {
    await connection.dropDatabase();
    await connection.close();
  } else {
    await connection.destroy();
  }
}

// Cleans up the database accordingly
export async function defaultAfter(ctx: DefaultContext): Promise<void> {
  await finishTestDB(ctx.connection);
}

export async function defaultTokens(tokenHandler: TokenHandler) {
  const admin: User = await (await UserFactory(await ADMIN_USER())).get();
  const user: User = await (await UserFactory()).get();
  const adminToken = await tokenHandler.signToken({ user: admin, roles: [UserType[UserType.LOCAL_ADMIN]], lesser: false }, 'nonce admin');
  const token = await tokenHandler.signToken({ user, roles: [UserType[UserType.MEMBER]], lesser: false }, 'nonce');
  return {
    admin,
    adminToken,
    user,
    token,
  };
}

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
  await (new TransferService()).postTransfer(transferRequest);
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
