/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * Vitest setup file.
 *
 * Loaded once per test run via `setupFiles` in `vitest.config.mts`. This
 * file is intentionally side-effect-only and must NOT be imported by
 * non-test code. Pure utilities (truncateAllTables, generateKeys) live in
 * `test/helpers/`.
 */

import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { use } from 'chai';
import chaiSwag from 'chai-swag';
import chaiHttp from 'chai-http';
import chaiAsPromised from 'chai-as-promised';
import chaiSorted from 'chai-sorted';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import dinero from 'dinero.js';
import log4js from 'log4js';
import sinonChai from 'sinon-chai';
import { config } from 'dotenv';
import '../src/database/database';
import Config from '../src/config';

// Root hooks (registers Vitest beforeAll/beforeEach/afterEach/afterAll globally)
import './root-hooks';

use(chaiAsPromised);
use(chaiHttp);
use(chaiSwag);
use(sinonChai);
use(chaiSorted);
use(deepEqualInAnyOrder);

config();
process.env.NODE_ENV = 'test';
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'OFF';
}
if (!process.env.NAME) {
  process.env.NAME = 'sudosos-test';
}
if (!process.env.SMTP_FROM) {
  process.env.SMTP_FROM = 'SudoSOS <no-reply@example.test>';
}
if (!process.env.SMTP_HOST) {
  process.env.SMTP_HOST = 'localhost';
}
if (!process.env.SMTP_PORT) {
  process.env.SMTP_PORT = '1025';
}
if (process.env.SMTP_USERNAME && !process.env.SMTP_PASSWORD) {
  process.env.SMTP_PASSWORD = 'test-password';
}
if (process.env.SMTP_PASSWORD && !process.env.SMTP_USERNAME) {
  process.env.SMTP_USERNAME = 'test-user';
}
if (!process.env.BCRYPT_ROUNDS) {
  process.env.BCRYPT_ROUNDS = '4';
}
if (!process.env.BCRYPT_ROUNDS_PIN) {
  process.env.BCRYPT_ROUNDS_PIN = '1';
}
if (!process.env.JWT_KEY_PATH) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  const jwtKeyPath = path.join(os.tmpdir(), `sudosos-test-jwt-${process.pid}.pem`);
  fs.writeFileSync(jwtKeyPath, privateKey, 'utf-8');
  process.env.JWT_KEY_PATH = jwtKeyPath;

  process.on('exit', () => {
    try { fs.unlinkSync(jwtKeyPath); } catch { /* already removed */ }
  });
}
if (!process.env.TYPEORM_CONNECTION || (process.env.TYPEORM_CONNECTION === 'better-sqlite3' && !(process.env.SKIP_SQLITE_DEFAULTS === 'true'))) {
  console.log('Setting sqlite defaults');
  process.env.HTTP_PORT = '3001';
  process.env.TYPEORM_CONNECTION = 'better-sqlite3';
  process.env.TYPEORM_DATABASE = ':memory:';
  process.env.TYPEORM_SYNCHRONIZE = 'true';
}

const originalEnv = process.env;
process.env = new Proxy(originalEnv, {
  set(target, property, value) {
    Config.reset();
    // Node stores environment values as strings.
    // eslint-disable-next-line no-param-reassign
    target[property as string] = value as string;
    return true;
  },
  deleteProperty(target, property) {
    Config.reset();
    // eslint-disable-next-line no-param-reassign
    delete target[property as string];
    return true;
  },
});
Config.reset();

dinero.defaultCurrency = 'EUR';
dinero.defaultPrecision = 2;

// Silent in-dependency logs, unless really wanted by the environment.
const logger = log4js.getLogger('Console');
logger.level = process.env.LOG_LEVEL;
console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);
