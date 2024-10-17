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
 * @module GEWIS/seed
 */

import GewisUser from '../entity/gewis-user';
import User from '../../entity/user/user';

/**
 * Seeds a default dataset of GEWIS Users, and stores them in the database.
 */
export default async function seedGEWISUsers(users: User[]): Promise<GewisUser[]> {
  const gewisUsers: GewisUser[] = [];

  const promises: Promise<any>[] = [];
  for (let i = 0; i < users.length; i += 1) {
    const gewisUser = Object.assign(new GewisUser(), {
      user: users[i],
      gewisId: 1000 + i,
    });
    promises.push(GewisUser.save(gewisUser).then((u) => gewisUsers.push(u)));
  }

  await Promise.all(promises);
  return gewisUsers;
}
