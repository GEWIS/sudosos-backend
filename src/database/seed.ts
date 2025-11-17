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
 * This is the module page of the seed.
 *
 * @module internal/database
 */

import { config } from 'dotenv';
import log4js from 'log4js';
import dinero, { Currency } from 'dinero.js';
import Database from './database';
import { Application } from '../index';
import seedDatabase from '../../test/seed';
import initializeDiskStorage from '../files/initialize';
import { truncateAllTables } from '../../test/setup';
import MemberUser from '../entity/user/member-user';
import User from '../entity/user/user';

export default async function createApp() {
  const application = new Application();
  application.logger = log4js.getLogger('Seeder');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting Seeder');

  application.connection = await Database.initialize();
  await truncateAllTables(application.connection);

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  initializeDiskStorage();

  try {
    await seedDatabase();
    application.logger.info('Seeding successful');
  } catch (e) {
    application.logger.error('Seeding failed', e);
  }
}

/**
 * Seeds a default dataset of Member Users, and stores them in the database.
 * @param users - Array of users to create member user entries for
 * @returns Array of created member users
 */
export async function seedMemberUsers(users: User[]): Promise<MemberUser[]> {
  const memberUsers: MemberUser[] = [];

  const promises: Promise<any>[] = [];
  for (let i = 0; i < users.length; i += 1) {
    const memberUser = Object.assign(new MemberUser(), {
      user: users[i],
      memberId: 1000 + i,
    });
    promises.push(MemberUser.save(memberUser).then((u) => memberUsers.push(u)));
  }

  await Promise.all(promises);
  return memberUsers;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  config();
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  createApp();
}
