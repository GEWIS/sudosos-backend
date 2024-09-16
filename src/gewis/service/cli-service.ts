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

import 'reflect-metadata';
import { Command } from 'commander';
import log4js from 'log4js';
import database from '../../database/database';
import GewisDBService from './gewisdb-service';
import { DataSource } from 'typeorm';

// Load environment variables
require('dotenv').config();

// Logger setup
const logger = log4js.getLogger('CLIService');
logger.level = 'info';


// Define the CLI program
const program = new Command();

async function dryRunSyncAll() {
  let dataSource: DataSource;
  try {
    // Initialize the datasource
    dataSource = await database.initialize();
    logger.info('Datasource initialized successfully.');

    // Call syncAll and log the results
    const updatedUsers = await GewisDBService.syncAll(false);
    logger.info('Updated users:', updatedUsers);
  } catch (error) {
    logger.error('Error during dry-run sync:', error);
  } finally {
    // Close the datasource connection
    await dataSource?.destroy();
    logger.info('Datasource connection closed.');
  }
}
program
  .command('db-sync')
  .description('Dry ryun sync users with GEWIS DB')
  .action(async () => {
    await dryRunSyncAll();
  });


// Parse the CLI arguments
program.parse(process.argv);
