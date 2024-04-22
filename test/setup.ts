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
/* eslint-disable import/prefer-default-export */
import * as util from 'util';
import { generateKeyPair } from 'crypto';
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
import { DataSource } from 'typeorm';

use(chaiAsPromised);
use(chaiHttp);
use(chaiSwag);
use(sinonChai);
use(chaiSorted);
use(deepEqualInAnyOrder);

process.env.NODE_ENV = 'test';
if (!process.env.TYPEORM_CONNECTION) {
  process.env.HTTP_PORT = '3001';
  process.env.TYPEORM_CONNECTION = 'sqlite';
  process.env.TYPEORM_DATABASE = ':memory:';
  process.env.TYPEORM_SYNCHRONIZE = 'true';
}

// Always sync in sqlite.
if (process.env.TYPEORM_CONNECTION === 'sqlite') {
  process.env.TYPEORM_SYNCHRONIZE = 'true';
}

dinero.defaultCurrency = 'EUR';
dinero.defaultPrecision = 2;

// Silent in-dependency logs, unless really wanted by the environment.
const logger = log4js.getLogger('Console');
logger.level = process.env.LOG_LEVEL;
console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);
config();

/**
 * Generates a basic RSA keypair.
 */
export async function generateKeys(): Promise<{ publicKey: string, privateKey: string }> {
  return util.promisify(generateKeyPair).bind(null, 'rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })();
}

/**
 * @returns The __filename converted to the TypeScript source file
 */
export function sourceFile(file: string) {
  return file.replace('out/test/', 'test/').replace('.js', '.ts');
}

export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  if (process.env.TYPEORM_CONNECTION !== 'mysql') return;

  console.error('Starting truncation of all tables...');
  const queryRunner = dataSource.createQueryRunner();

  await queryRunner.connect();

  try {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0;'); // Disable FK checks to avoid issues

    // Retrieve all table names except for system tables (if any)
    const tables = await queryRunner.query('SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\';');

    for (const table of tables) {
      const tableName = table[Object.keys(table)[0]]; // Gets table name dynamically
      console.error(`Truncating table: ${tableName}`);
      await queryRunner.query(`TRUNCATE TABLE \`${tableName}\`;`);
    }

    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1;'); // Re-enable FK checks
    console.error('All tables truncated successfully.');
  } catch (err) {
    console.error('Failed to truncate tables:', err);
    throw err;
  } finally {
    await queryRunner.release();
  }
}
