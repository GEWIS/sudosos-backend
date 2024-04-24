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
import { Configuration, MembersApi, MemberSimple } from 'gewisdb-ts-client';
import log4js, { Logger } from 'log4js';
import { webResponseToUpdate } from '../helpers/gewis-helper';
import UserService from '../../service/user-service';

const GEWISDB_API_URL =  process.env.GEWISDB_API_URL;
const GEWISDB_API_KEY =  process.env.GEWISDB_API_KEY;

export default class GewisDBService {

  private logger: Logger = log4js.getLogger('GewisDBService');

  gewisDB = {
    configuration: new Configuration({ basePath: GEWISDB_API_URL, accessToken: () => GEWISDB_API_KEY }),
    api: new MembersApi(),
  };

  public constructor() {
    this.gewisDB.api = new MembersApi(this.gewisDB.configuration);
    this.logger.level = log4js.levels.ALL;
  }

  public async sync() {
    const gewisUsers = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'] });
    // console.error(gewisUsers);
    gewisUsers[0].gewisId = 1;
    const promises: Promise<void>[] = gewisUsers.map((u) => this.updateUser(u));
    await Promise.all(promises);
  }

  async updateUser(gewisUser: GewisUser) {
    this.logger.trace(`Syncing GEWIS User ${gewisUser.gewisId}`);
    const dbMember: MemberSimple | void = await this.gewisDB.api.membersLidnrGet(gewisUser.gewisId).then((m) => {
      return m.data.data;
    }).catch((e) => {
      this.logger.error(`Failed to fetch: ${e}`);
    });

    if (!dbMember) {
      this.logger.trace(`Could not find GEWIS User ${gewisUser.gewisId} in DB.`);
      return;
    }

    const expirationDate = new Date(dbMember.expiration);
    const expired = new Date() > expirationDate;

    if (expired) {
      this.logger.log(`User ${gewisUser.gewisId} has expired, closing account.`);
      // handle expired user
    }

    const update = webResponseToUpdate(dbMember);
    if (gewisUser.user.firstName !== update.firstName || gewisUser.user.lastName !== update.lastName || gewisUser.user.ofAge !== update.ofAge || gewisUser.user.email !== update.email) {
      return UserService.updateUser(gewisUser.user.id, update).then(() => {
        this.logger.log(`Updated user m${gewisUser.gewisId} (id ${gewisUser.userId}) with `, update);
      });
    }
  }

}
