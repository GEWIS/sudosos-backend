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
 * This is the maintenance script for development setup.
 * It performs maintenance tasks that are normally handled by cron jobs.
 *
 * @module internal/maintenance
 */

import 'reflect-metadata';
import { config } from 'dotenv';
import log4js, { Logger } from 'log4js';
import Database from './database/database';
import dinero, { Currency } from 'dinero.js';
import { DataSource } from 'typeorm';
import BalanceService from './service/balance-service';
import RoleManager from './rbac/role-manager';
import Gewis from './gewis/gewis';
import DefaultRoles from './rbac/default-roles';
import LdapSyncService from './service/sync/user/ldap-sync-service';
import { UserSyncService } from './service/sync/user/user-sync-service';
import UserSyncManager from './service/sync/user/user-sync-manager';
import GewisDBSyncService from './gewis/service/gewisdb-sync-service';
import ServerSettingsStore from './server-settings/server-settings-store';
import UserNotificationPreferenceService from "./service/user-notification-preference-service";

class MaintenanceApplication {
  logger: Logger;

  connection: DataSource;

  roleManager: RoleManager;

  public async stop(): Promise<void> {
    await this.connection.destroy();
    this.logger.info('Maintenance completed.');
  }
}

/**
 * Validates that the environment is set to development
 */
function validateDevelopmentEnvironment(logger: Logger): void {
  if (process.env.NODE_ENV !== 'development') {
    logger.error('This script is only meant for development environments.');
    logger.error(`Current NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    logger.error('Please set NODE_ENV=development to run this script.');
    process.exit(1);
  }
  logger.info('Development environment validated');
}

/**
 * Performs all maintenance tasks that are normally handled by cron jobs
 */
async function performMaintenanceTasks(application: MaintenanceApplication): Promise<void> {
  // Set up monetary value configuration
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);
  application.logger.info('Monetary configuration set up');

  // Initialize database-stored settings
  const store = ServerSettingsStore.getInstance();
  if (!store.initialized) {
    await store.initialize();
    application.logger.info('Server settings initialized');
  }

  // Setup RBAC
  application.roleManager = await new RoleManager().initialize();
  application.logger.info('Role manager initialized');

  // Synchronize SudoSOS system roles
  application.logger.info('Synchronizing default roles...');
  await DefaultRoles.synchronize();
  application.logger.info('Default roles synchronized');

  // Update balances
  application.logger.info('Updating balances...');
  await new BalanceService().updateBalances({});
  application.logger.info('Balances updated');

  // Sync user notification preferences
  application.logger.info('Syncing user notification preferences...');
  await new UserNotificationPreferenceService().syncAllUserNotificationPreferences();
  application.logger.info('User notification preferences synced');

  // INJECT GEWIS BINDINGS
  Gewis.overwriteBindings();
  application.logger.info('GEWIS bindings injected');

  // Setup user synchronization services based on environment variables
  const syncServices: UserSyncService[] = [];

  if (process.env.ENABLE_LDAP === 'true') {
    application.logger.info('Setting up LDAP sync service...');
    const ldapSyncService = new LdapSyncService(application.roleManager);
    syncServices.push(ldapSyncService);
    application.logger.info('LDAP sync service configured');
  } else {
    application.logger.info('LDAP sync disabled (ENABLE_LDAP not set to true)');
  }

  if (process.env.GEWISDB_API_KEY && process.env.GEWISDB_API_URL) {
    application.logger.info('Setting up GEWIS DB sync service...');
    const gewisDBSyncService = new GewisDBSyncService();
    syncServices.push(gewisDBSyncService);
    application.logger.info('GEWIS DB sync service configured');
  } else {
    application.logger.info('GEWIS DB sync disabled (missing API key or URL)');
  }

  // Run user synchronization if services are configured
  if (syncServices.length > 0) {
    application.logger.info('Running user synchronization...');
    const syncManager = new UserSyncManager(syncServices);
    
    // Fetch users first
    await syncManager.fetch();
    application.logger.info('User data fetched');
    
    // Then sync users
    await syncManager.run();
    application.logger.info('User synchronization completed');
  } else {
    application.logger.info('No user sync services configured');
  }

  application.logger.info('All maintenance tasks completed successfully');
}

/**
 * Main maintenance function
 */
async function runMaintenance(): Promise<void> {
  try {
    // Load environment variables
    config();
    
    // Initialize application
    const application = new MaintenanceApplication();
    application.connection = await Database.initialize();
    application.logger = log4js.getLogger('Maintenance');
    application.logger.level = process.env.LOG_LEVEL;
    application.logger.info('Starting maintenance tasks...');

    console.log = (message: any, ...additional: any[]) => application.logger.debug(message, ...additional);

    // Validate environment
    validateDevelopmentEnvironment(application.logger);
    
    // Perform maintenance tasks
    await performMaintenanceTasks(application);
    
    application.logger.info('SudoSOS development maintenance completed successfully!');
    
    await application.stop();
    
  } catch (error) {
    console.error('❌ Maintenance failed:', error);
    const logger = log4js.getLogger('maintenance');
    logger.level = process.env.LOG_LEVEL;
    logger.fatal('Maintenance failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  // Only execute the maintenance directly if this is the main execution file
  void runMaintenance();
}
