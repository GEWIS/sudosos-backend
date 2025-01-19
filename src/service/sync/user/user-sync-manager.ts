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

import User from '../../../entity/user/user';
import { In } from 'typeorm';
import log4js, { Logger } from 'log4js';
import SyncManager from '../sync-manager';
import { UserSyncService } from './user-sync-service';

export default class UserSyncManager extends SyncManager<User, UserSyncService> {

  protected logger: Logger = log4js.getLogger('UserSyncManager');

  async getTargets(): Promise<User[]> {
    const userTypes = this.services.flatMap((s) => s.targets);
    this.logger.trace('Syncing users of types', userTypes);
    return this.manager.find(User, { where: { type: In(userTypes), deleted: false } });
  }
}
