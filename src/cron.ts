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
import Database from './database/database';
import dinero, { Currency } from 'dinero.js';
import { DataSource } from 'typeorm';
import cron from 'node-cron';
import BalanceService from './service/balance-service';
import RoleManager from './rbac/role-manager';
import Gewis from './gewis/gewis';
import EventService from './service/event-service';
import DefaultRoles from './rbac/default-roles';
import UserSyncServiceFactory from './service/sync/user/user-sync-service-factory';
import UserSyncManager from './service/sync/user/user-sync-manager';
import getAppLogger from './helpers/logging';
import ServerSettingsStore from './server-settings/server-settings-store';
import UserNotificationPreferenceService from './service/user-notification-preference-service';

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

  const logger = getAppLogger('Console (cron)');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  // Initialize database-stored settings
  const store = ServerSettingsStore.getInstance();
  if (!store.initialized) await store.initialize();

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
  const syncUserNotificationPreferences = cron.schedule('0 1 * * *', () => {
    logger.debug('Syncing user notification preferences.');
    new UserNotificationPreferenceService().syncAllUserNotificationPreferences().then(() => {
      logger.debug('User notification preferences.');
    }).catch((error) => {
      logger.error('Could not sync user notification preferences.', error);
    });
  });

  application.tasks = [syncBalances, syncEventShiftAnswers, sendEventPlanningReminders, syncUserNotificationPreferences];

  // INJECT GEWIS BINDINGS
  Gewis.overwriteBindings();

  // Create sync services using the factory
  const syncServiceFactory = new UserSyncServiceFactory();
  const syncServices = syncServiceFactory.createSyncServices({
    roleManager: application.roleManager,
    manager: application.connection.manager,
  });

  if (syncServices.length !== 0) {
    application.logger.info('Registering user sync tasks', syncServices.map(s => s.constructor.name));
    const syncManager = new UserSyncManager(syncServices);

    const userSyncer = cron.schedule('41 1 * * *', async () => {
      logger.debug('Syncing users.');
      const results = await syncManager.run();
      logger.debug(`Sync completed: ${results.passed.length} passed, ${results.failed.length} failed, ${results.skipped.length} skipped`);
    });
    application.tasks.push(userSyncer);

    const userFetcher = cron.schedule('*/15 * * * *', async () => {
      logger.debug('Fetching users.');
      await syncManager.fetch();
    });
    application.tasks.push(userFetcher);
  } else {
    application.logger.warn('Skipping user syncing');
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
