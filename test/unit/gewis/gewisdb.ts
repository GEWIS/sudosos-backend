/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import { defaultBefore, DefaultContext } from '../../helpers/test-helpers';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import GewisUser from '../../../src/gewis/entity/gewis-user';
import { seedUsers } from '../../seed';
import seedGEWISUsers from '../../../src/gewis/database/seed';
import GewisDBService from '../../../src/gewis/service/gewisdb-service';

describe('GEWISDB Service', async (): Promise<void> => {

  let ctx: DefaultContext & {
    users: User[],
    gewisUsers: GewisUser[],
    service: GewisDBService,
  };

  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    } as any;
    ctx.users = await seedUsers();
    ctx.gewisUsers = await seedGEWISUsers(ctx.users.slice(0, 2));
    ctx.service = new GewisDBService();
  });

  after(async () => {
    await Database.finish(ctx.connection);
  });

  describe('sync', async () => {
    it('should sync the GEWIS users with the database', async () => {
      await ctx.service.sync();
      console.error(ctx.users[0], ctx.users[1]);
    });
  });
});
