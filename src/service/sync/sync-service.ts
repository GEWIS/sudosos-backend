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

import User, { UserType } from '../../entity/user/user';
import WithManager from '../../database/with-manager';

export interface SyncResult {
  skipped: boolean;
  result: boolean;
}

/**
 * SyncService interface.
 *
 * SyncService is the abstract class which is used to sync user data.
 * This can be used to integrate external data sources into the SudoSOS back-end.
 */
export abstract class SyncService extends WithManager {

  /**
   * Targets is the list of user types that this sync service is responsible for.
   *
   * Used to improve performance by only syncing the relevant user types.
   */
  targets: UserType[];

  /**
   * Guard determines whether the user should be synced using this sync service.
   *
   * Not passing the guard will result in the user being skipped.
   * A skipped sync does not count as a failure.
   *
   * @param user The user to check.
   * @returns {Promise<boolean>} True if the user should be synced, false otherwise.
   */
  protected guard(user: User): Promise<boolean> {
    return Promise.resolve(this.targets.includes(user.type));
  }

  /**
   * Up is a wrapper around `sync` that handles the guard.
   *
   * @param user
   *
   * @returns {Promise<SyncResult>} The result of the sync.
   */
  async up(user: User): Promise<SyncResult> {
    const guardResult = await this.guard(user);
    if (!guardResult) return { skipped: true, result: false };

    const result = await this.sync(user);
    return { skipped: false, result };
  }

  /**
   * Synchronizes the user data with the external data source.
   *
   * @param user The user to synchronize.
   * @returns {Promise<boolean>} True if the user was synchronized, false otherwise.
   */
  protected abstract sync(user: User): Promise<boolean>;

  /**
   * Fetches the user data from the external data source.
   * `sync` can be seen as a `push` and `fetch` as a `pull`.
   *
   */
  abstract fetch(): Promise<void>;

  /**
   * Down is called when the SyncService decides that the user is no longer connected to this sync service be removed.
   * This can be used to remove the user from the database or clean up entities.
   *
   * This should be revertable and idempotent!
   *
   * @param user
   */
  abstract down(user: User): Promise<void>;

  /**
   * Called before a sync batch is started.
   */
  pre(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Called after a sync batch is finished.
   */
  post(): Promise<void> {
    return Promise.resolve();
  }
}
