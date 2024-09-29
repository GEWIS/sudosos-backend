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

import User from '../../entity/user/user';
import WithManager from '../../database/with-manager';
import { SyncResult, SyncService } from './sync-service';
import { In } from 'typeorm';
import log4js, { Logger } from 'log4js';

export default class UserSyncService extends WithManager {

  private readonly services: SyncService[];

  private logger: Logger = log4js.getLogger('UserSync');

  constructor(services: SyncService[]) {
    super();
    this.services = services;
  }

  async syncUsers() {
    const userTypes = this.services.flatMap((s) => s.targets);
    this.logger.trace('Syncing users of types', userTypes);

    const users = await this.manager.find(User, { where: { type: In(userTypes) } });
    for (const user of users) {
      const result = await this.sync(user);

      if (result.skipped) {
        this.logger.trace('Skipping sync for user', user.id);
        continue;
      }

      if (result.error) {
        this.logger.error('Sync failed for user', user.id);
        continue;
      }

      if (result.result === false) {
        this.logger.warn('User is detached', user.id);
        await this.down(user);
      }
    }
  }

  async sync(user: User): Promise<SyncResult> {
    const syncResult: SyncResult = { skipped: true, error: false, result: false };

    // Aggregate results from all services
    for (const service of this.services) {
      const result = await service.up(user);

      if (!result.skipped) syncResult.skipped = false;
      if (result.error) syncResult.error = true;
      if (result.result) syncResult.result = true;
    }

    return syncResult;
  }

  async down(user: User): Promise<void> {
    for (const service of this.services) {
      try {
        await service.down(user);
      } catch (error) {
        this.logger.error('Could not down user', user.id);
      }
    }
  }

  async fetch(): Promise<User[]> {
    const results: User[] = [];
    for (const service of this.services) {
      results.push(...await service.fetch());
    }
    return results;
  }
}
