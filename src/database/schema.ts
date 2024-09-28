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
 * This is the module page of the schema.
 *
 * @module internal/database
 */

import { config } from 'dotenv';
import log4js from 'log4js';
import dinero, { Currency } from 'dinero.js';
import Database from './database';
import { Application } from '../index';

export default async function createApp() {
  const application = new Application();
  application.logger = log4js.getLogger('Seeder');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting Schema Synchronizer');

  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  try {
    await application.connection.synchronize();
    application.logger.info('Schema synchronized successfully');
    await application.connection.destroy();
  } catch (e) {
    application.logger.error('Error synchronizing schema', e);
  }
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  config();
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  createApp();
}
