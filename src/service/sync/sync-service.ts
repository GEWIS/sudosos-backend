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

/**
 * SyncService interface.
 *
 * SyncService is the abstract class which is used to sync user data.
 * This can be used to integrate external data sources into the SudoSOS back-end.
 */
export abstract class SyncService extends WithManager {
  /**
   * Synchronizes the user data with the external data source.
   *
   * @param user The user to synchronize.
   */
  abstract sync(user: User): Promise<void>;

  /**
   * Imports the user data from the external data source.
   * This is the inverse of the sync() method.
   *
   * @return The imported user data.
   */
  abstract import(): Promise<User[]>;
}
