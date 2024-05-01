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
import { BasicApi, Configuration, Health, MembersApi } from 'gewisdb-ts-client';
import log4js, { Logger } from 'log4js';
import { webResponseToUpdate } from '../helpers/gewis-helper';
import UserService from '../../service/user-service';
import { UserResponse } from '../../controller/response/user-response';

const GEWISDB_API_URL = process.env.GEWISDB_API_URL;
const GEWISDB_API_KEY = process.env.GEWISDB_API_KEY;

// Configuration for the API access
const configuration = new Configuration({ basePath: GEWISDB_API_URL, accessToken: () => GEWISDB_API_KEY });
const api = new MembersApi(configuration);
const pinger = new BasicApi(configuration);

// Logger setup
const logger: Logger = log4js.getLogger('GewisDBService');
logger.level = log4js.levels.ALL;

export default class GewisDBService {

  public static api = api;

  public static pinger = pinger;

  /**
   * Synchronizes ALL users with GEWIS DB user data.
   * This method only returns users that were actually updated during the synchronization process.
   * @returns {Promise<UserResponse[]>} A promise that resolves with an array of UserResponses for users that were updated. Returns null if the API is unhealthy.
   */
  public static async syncAll(): Promise<UserResponse[]> {
    const gewisUsers = await GewisUser.find({ where: { user: { deleted: false } }, relations: ['user'] });
    return this.sync(gewisUsers);
  }

  /**
   * Synchronizes users with GEWIS DB user data.
   * This method only returns users that were actually updated during the synchronization process.
   * @param {GewisUser[]} gewisUsers - Array of users to sync.
   * @returns {Promise<UserResponse[]>} A promise that resolves with an array of UserResponses for users that were updated. Returns null if the API is unhealthy.
   */
  public static async sync(gewisUsers: GewisUser[]): Promise<UserResponse[]> {
    const ping: Health = await GewisDBService.pinger.healthGet().then(member => member)
      .catch((error) => {
        logger.warn('Failed to ping GEWIS DB', error);
        return null;
      });

    if (ping.sync_paused) {
      logger.warn('GEWISDB API paused, aborting.');
      return null;
    }

    if (!ping.healthy) {
      logger.warn('GEWISDB API unhealthy, aborting.');
      return null;
    }

    const updates: UserResponse[] = [];
    const promises = gewisUsers.map(user => GewisDBService.updateUser(user).then((u) => {
      if (u) updates.push(u);
    }));

    return Promise.all(promises).then(() => updates).catch(() => null);
  }

  /**
   * Updates a user in the local database based on the GEWIS DB data.
   * @param {GewisUser} gewisUser - The user to be updated.
   */
  public static async updateUser(gewisUser: GewisUser) {
    logger.trace(`Syncing GEWIS User ${gewisUser.gewisId}`);
    const dbMember = await GewisDBService.api.membersLidnrGet(gewisUser.gewisId).then(member => member.data.data)
      .catch(error => {
        logger.error(`Failed to fetch: ${error}`);
        return null;
      });

    if (!dbMember) {
      logger.trace(`Could not find GEWIS User ${gewisUser.gewisId} in DB.`);
      return;
    }

    const expirationDate = new Date(dbMember.expiration);
    const expired = new Date() > expirationDate;

    if (expired) {
      logger.log(`User ${gewisUser.gewisId} has expired, closing account.`);
      return UserService.closeUser(gewisUser.user.id);
    }

    const update = webResponseToUpdate(dbMember);
    if (GewisDBService.isUpdateNeeded(gewisUser, update)) {
      logger.log(`Updated user m${gewisUser.gewisId} (id ${gewisUser.userId}) with `, update);
      return UserService.updateUser(gewisUser.user.id, update);
    }
  }

  /**
   * Checks if the user needs an update.
   * @param {GewisUser} gewisUser - The local user data.
   * @param {any} update - The new data to potentially update.
   * @returns {boolean} True if an update is needed, otherwise false.
   */
  private static isUpdateNeeded(gewisUser: GewisUser, update: any): boolean {
    return gewisUser.user.firstName !== update.firstName ||
      gewisUser.user.lastName !== update.lastName ||
      gewisUser.user.ofAge !== update.ofAge ||
      gewisUser.user.email !== update.email;
  }
}
