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
    this.logger.level = process.env.LOG_LEVEL;
    this.services = services;
  }

  async syncUsers() {
    const userTypes = this.services.flatMap((s) => s.targets);
    this.logger.trace('Syncing users of types', userTypes);
    await this.pre();

    const users = await this.manager.find(User, { where: { type: In(userTypes) } });
    for (const user of users) {
      try {
        const result = await this.sync(user);

        if (result.skipped) {
          this.logger.trace('Syncing skipped for user', user.id, user.firstName, user.type);
          continue;
        }

        if (result.result === false) {
          this.logger.warn('Sync result: false for user', user.id);
          await this.down(user);
        } else {
          this.logger.trace('Sync result: true for user', user.id);
        }

      } catch (error) {
        this.logger.error('Syncing error for user', user.id, error);
      }
    }

    await this.post();
  }

  async sync(user: User): Promise<SyncResult> {
    const syncResult: SyncResult = { skipped: true, result: false };

    // Aggregate results from all services
    for (const service of this.services) {
      const result = await service.up(user);

      if (!result.skipped) syncResult.skipped = false;
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

  async fetch(): Promise<void> {
    await this.pre();
    for (const service of this.services) {
      await service.fetch();
    }
    await this.post();
  }

  async pre(): Promise<void> {
    for (const service of this.services) {
      await service.pre();
    }
  }

  async post(): Promise<void> {
    for (const service of this.services) {
      await service.post();
    }
  }
}
