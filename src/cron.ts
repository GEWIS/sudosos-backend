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
 */

import log4js, { Logger } from 'log4js';
import Database from './database/database';
import dinero, { Currency } from 'dinero.js';
import { Connection } from 'typeorm';
import cron from 'node-cron';
import BalanceService from './service/balance-service';
import ADService from './service/ad-service';
import RoleManager from './rbac/role-manager';
import Gewis from './gewis/gewis';
import GewisDBService from './gewis/service/gewisdb-service';

class CronApplication {
  logger: Logger;

  connection: Connection;

  tasks: cron.ScheduledTask[];

  roleManager: RoleManager;

  public async stop(): Promise<void> {
    this.tasks.forEach((task) => task.stop());
    await this.connection.close();
    this.logger.info('Application stopped.');
  }
}

async function createCronTasks(): Promise<void> {
  const application = new CronApplication();
  application.connection = await Database.initialize();
  application.logger = log4js.getLogger('Application');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting cron tasks...');

  const logger = log4js.getLogger('Console (cron)');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  // Setup RBAC.
  application.roleManager = await new RoleManager().initialize();

  await BalanceService.updateBalances({});
  const syncBalances = cron.schedule('41 1 * * *', () => {
    logger.debug('Syncing balances.');
    BalanceService.updateBalances({}).then(() => {
      logger.debug('Synced balances.');
    }).catch((error => {
      logger.error('Could not sync balances.', error);
    }));
  });

  application.tasks = [syncBalances];

  // INJECT GEWIS BINDINGS
  Gewis.overwriteBindings();

  if (process.env.ENABLE_LDAP === 'true') {
    await ADService.syncUsers();
    await ADService.syncSharedAccounts().then(
      () => ADService.syncUserRoles(application.roleManager),
    );
    const syncADGroups = cron.schedule('*/10 * * * *', async () => {
      logger.debug('Syncing AD.');
      await ADService.syncSharedAccounts().then(
        () => ADService.syncUserRoles(application.roleManager),
      );
      logger.debug('Synced AD');
    });
    application.tasks.push(syncADGroups);
  }

  if (process.env.GEWISDB_API_KEY && process.env.GEWISDB_API_URL) {
    await GewisDBService.syncAll();
    const syncGewis = cron.schedule('41 4 * * *', async () => {
      logger.debug('Syncing users with GEWISDB.');
      await GewisDBService.syncAll();
      logger.debug('Synced users with GEWISDB.');
    });
    application.tasks.push(syncGewis);
  }
  application.logger.info('Tasks registered');
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  createCronTasks().catch((e) => {
    console.error(e);
    const logger = log4js.getLogger('index');
    logger.level = process.env.LOG_LEVEL;
    logger.fatal(e);
  });
}
