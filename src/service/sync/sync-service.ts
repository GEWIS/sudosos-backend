/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the abstract sync-service.
 *
 * @module internal/sync-service
 */

import WithManager from '../../database/with-manager';

export interface SyncResult {
  skipped: boolean;
  result: boolean;
}

/**
 * SyncService interface.
 *
 * SyncService is the abstract class which is used to sync entity data.
 * This can be used to integrate external data sources into the SudoSOS back-end.
 */
export abstract class SyncService<T> extends WithManager {

  /**
   * Guard determines whether the entity should be synced using this sync service.
   *
   * Not passing the guard will result in the user being skipped.
   * A skipped sync does not count as a failure.
   *
   * @param entity The entity to check.
   * @returns {Promise<boolean>} True if the entity should be synced, false otherwise.
   */
  abstract guard(entity: T): Promise<boolean>;

  /**
   * Up is a wrapper around `sync` that handles the guard.
   *
   * @param entity
   * @param isDryRun - Whether this is a dry run (no actual changes)
   * @returns {Promise<SyncResult>} The result of the sync.
   */
  async up(entity: T, isDryRun: boolean = false): Promise<SyncResult> {
    const guardResult = await this.guard(entity);
    if (!guardResult) return { skipped: true, result: false };

    const result = await this.sync(entity, isDryRun);
    return { skipped: false, result };
  }

  /**
   * Synchronizes the user data with the external data source.
   *
   * @param entity The user to synchronize.
   * @param isDryRun - Whether this is a dry run (no actual changes)
   * @returns {Promise<boolean>} True if the user was synchronized, false otherwise.
   */
  protected abstract sync(entity: T, isDryRun?: boolean): Promise<boolean>;

  /**
   * Fetches the user data from the external data source.
   * `sync` can be seen as a `push` and `fetch` as a `pull`.
   *
   */
  abstract fetch(): Promise<void>;

  /**
   * Down is called when the SyncService decides that the entity is no longer connected to this sync service be removed.
   * This can be used to remove the entity from the database or clean up entities.
   *
   * This should be revertible and idempotent!
   *
   * @param entity
   * @param isDryRun - Whether this is a dry run (no actual changes)
   */
  abstract down(entity: T, isDryRun?: boolean): Promise<void>;

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
