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
 * This is the module page of the schema.
 *
 * @module internal/database
 */

import log4js from 'log4js';
import dinero, { Currency } from 'dinero.js';
import Database from './database';
import { Application } from '../index';
import Config from '../config';
import { applyConfiguredLogLevel } from '../helpers/logging';

export default async function createApp() {
  const config = Config.get();
  const application = new Application();
  application.logger = log4js.getLogger('Seeder');
  applyConfiguredLogLevel(application.logger);
  application.logger.info('Starting Schema Synchronizer');

  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  applyConfiguredLogLevel(logger);
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = config.currency.code as Currency;
  dinero.defaultPrecision = config.currency.precision;

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
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  createApp();
}
