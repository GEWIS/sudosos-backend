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
import GewisUser from '../entity/gewis-user';
import { Configuration, MembersApi } from 'gewisdb-ts-client';

const GEWISDB_API_URL =  process.env.GEWISDB_API_URL;
const GEWISDB_API_KEY =  process.env.GEWISDB_API_KEY;

export default class GewisDBService {

  gewisDB = {
    configuration: new Configuration({ basePath: GEWISDB_API_URL, accessToken: () => GEWISDB_API_KEY }),
    api: new MembersApi(),
  };

  public constructor() {
    this.gewisDB.api = new MembersApi(this.gewisDB.configuration);
  }

  public async sync() {
    const gewisUsers = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'] });
    // console.error(gewisUsers);
    console.error(await this.gewisDB.api.membersGet())
    const promises: Promise<void>[] = gewisUsers.map((u) => this.updateUser(u));
    await Promise.all(promises);
  }

  async updateUser(gewisUser: GewisUser) {
    // console.error(await this.gewisDB.api.membersGet())
  }

}
