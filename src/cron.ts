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
 * This is the module page the cron job service.
 *
 * @module internal/cron
 */

import log4js, { Logger } from 'log4js';
import Database, { AppDataSource } from './database/database';
import dinero, { Currency } from 'dinero.js';
import { DataSource } from 'typeorm';
import cron from 'node-cron';
import BalanceService from './service/balance-service';
import RoleManager from './rbac/role-manager';
import Gewis from './gewis/gewis';
import EventService from './service/event-service';
import DefaultRoles from './rbac/default-roles';
import { SyncService } from './service/sync/sync-service';
import LdapSyncService from './service/sync/ldap-sync-service';

class CronApplication {
  logger: Logger;

  connection: DataSource;

  tasks: cron.ScheduledTask[];

  roleManager: RoleManager;

  public async stop(): Promise<void> {
    this.tasks.forEach((task) => task.stop());
    await this.connection.destroy();
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

  // Synchronize SudoSOS system roles
  await DefaultRoles.synchronize();

  await new BalanceService().updateBalances({});
  const syncBalances = cron.schedule('41 1 * * *', () => {
    logger.debug('Syncing balances.');
    new BalanceService().updateBalances({}).then(() => {
      logger.debug('Synced balances.');
    }).catch((error => {
      logger.error('Could not sync balances.', error);
    }));
  });
  const syncEventShiftAnswers = cron.schedule('39 2 * * *', () => {
    logger.debug('Syncing event shift answers.');
    EventService.syncAllEventShiftAnswers()
      .then(() => logger.debug('Synced event shift answers.'))
      .catch((error) => logger.error('Could not sync event shift answers.', error));
  });
  const sendEventPlanningReminders = cron.schedule('39 13 * * *', () => {
    logger.debug('Send event planning reminder emails.');
    EventService.sendEventPlanningReminders()
      .then(() => logger.debug('Sent event planning reminder emails.'))
      .catch((error) => logger.error('Could not send event planning reminder emails.', error));
  });

  application.tasks = [syncBalances, syncEventShiftAnswers, sendEventPlanningReminders];

  // INJECT GEWIS BINDINGS
  Gewis.overwriteBindings();

  const syncServices: SyncService[] = [];

  if (process.env.ENABLE_LDAP === 'true') {
    const ldapSyncService = new LdapSyncService(application.roleManager, AppDataSource.manager);
    syncServices.push(ldapSyncService);
  }

  // TODO move to GewisDBSyncService
  // if (process.env.GEWISDB_API_KEY && process.env.GEWISDB_API_URL && process.env.ENABLE_GEWISDB_SYNC) {
  //   await GewisDBService.syncAll();
  //   const syncGewis = cron.schedule('41 4 * * *', async () => {
  //     logger.debug('Syncing users with GEWISDB.');
  //     await GewisDBService.syncAll();
  //     logger.debug('Synced users with GEWISDB.');
  //   });
  //   application.tasks.push(syncGewis);
  // }

  // TODO sensible cron schedule
  // const runSyncer = cron.schedule('*/10 * * * *', async () => {
  // }

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
