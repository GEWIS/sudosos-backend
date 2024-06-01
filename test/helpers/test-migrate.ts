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
import { config } from 'dotenv';
import log4js from 'log4js';
import { Application } from '../../src';
import Database from '../../src/database/database';

export default async function migrate() {
  const application = new Application();
  application.logger = log4js.getLogger('Migration');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting Migrator');

  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  try {
    application.logger.log('Starting synchronize + migrations.');
    await application.connection.synchronize();
    await application.connection.runMigrations({ transaction: 'all', fake: true });
    await application.connection.undoLastMigration({ transaction: 'all' });
    await application.connection.runMigrations({ transaction: 'all' });
    await application.connection.close();
    application.logger.log('Finished synchronize + migrations.');
  } catch (e) {
    application.logger.error('Error migrating db', e);
  }
}

// Only allow in test environment, for production use CLI.
if (require.main === module || process.env.NODE_ENV === 'test') {
  // Only execute the application directly if this is the main execution file.
  config();
  if (process.env.TYPEORM_CONNECTION === 'sqlite') console.warn('Migrations in sqlite most likely have no effect.');
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  migrate();
}
