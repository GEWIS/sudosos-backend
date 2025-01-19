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
 * This is the module page of the gewis-db-sync-service.
 *
 * @module GEWIS/gewis-db-sync-service
 */

import { UserSyncService } from '../../service/sync/user/user-sync-service';
import User, { UserType } from '../../entity/user/user';
import log4js, { getLogger, Logger } from 'log4js';
import GewisUser from '../entity/gewis-user';
import { webResponseToUpdate } from '../helpers/gewis-helper';
import BalanceService from '../../service/balance-service';
import UserService from '../../service/user-service';
import MembershipExpiryNotification from '../../mailer/messages/membership-expiry-notification';
import DineroTransformer from '../../entity/transformer/dinero-transformer';
import Mailer from '../../mailer';
import { Language } from '../../mailer/mail-message';
import { BasicApi, Configuration, MembersApi } from 'gewisdb-ts-client';
import ServerSettingsStore from '../../server-settings/server-settings-store';
import { ISettings } from '../../entity/server-setting';
import { EntityManager } from 'typeorm';


export default class GewisDBSyncService extends UserSyncService {

  targets = [UserType.MEMBER];
  
  private api: MembersApi;

  private pinger: BasicApi;

  private logger: Logger = log4js.getLogger('GewisDBSyncService');

  constructor(gewisdbApiKey?: string, gewisdbApiUrl?: string, manager?: EntityManager) {
    super(manager);
    const basePath = gewisdbApiUrl ?? process.env.GEWISDB_API_URL;
    const token = gewisdbApiKey ?? process.env.GEWISDB_API_KEY;
    this.api = new MembersApi(new Configuration({ basePath, accessToken: () => token }));
    this.pinger = new BasicApi(new Configuration({ basePath, accessToken: () => token }));
    this.logger.level = process.env.LOG_LEVEL;
  }

  async guard(entity: User): Promise<boolean> {
    if (!await super.guard(entity)) return false;
    
    const gewisUser = await this.manager.findOne(GewisUser, { where: { user: { id: entity.id } }, relations: ['user'] });
    return !!gewisUser;
  }

  async pre(): Promise<void> {
    const ping = await this.pinger.healthGet().then(health => health.data);
    const ready = ping.sync_paused === false && ping.healthy === true;
    if (!ready) {
      throw new Error('GEWISDB is not ready for syncing');
    }
  }

  async sync(entity: User): Promise<boolean> {
    const gewisUser = await this.manager.findOne(GewisUser, { where: { user: { id: entity.id } }, relations: ['user'] });
    if (!gewisUser) {
      throw new Error('GEWIS User not found.');
    }

    const dbMember = await this.api.membersLidnrGet(gewisUser.gewisId).then(member => member.data.data);
    if (!dbMember) return false;

    const expirationDate = new Date(dbMember.expiration);
    const expired = new Date() > expirationDate;

    if (expired) {
      this.logger.log(`User ${gewisUser.gewisId} has expired.`);
      return false;
    }

    const update = webResponseToUpdate(dbMember);
    if (GewisDBSyncService.isUpdateNeeded(gewisUser, update)) {
      this.logger.log(`Updating user m${gewisUser.gewisId} (id ${gewisUser.userId}) with `, update);
      const user = gewisUser.user;
      user.firstName = update.firstName;
      user.lastName = update.lastName;
      user.email = update.email;
      user.ofAge = update.ofAge;
      await this.manager.save(user);
      return true;
    }
    return true;
  }

  private static async getAllowDelete(): Promise<boolean> {
    return ServerSettingsStore.getInstance().getSetting('allowGewisSyncDelete') as ISettings['allowGewisSyncDelete'];
  }

  async down(entity: User): Promise<void> {
    const gewisUser = await this.manager.findOne(GewisUser, { where: { user: { id: entity.id } } });
    if (!gewisUser) return;
    
    // We do not delete the GewisUser, for if we ever want to undo deletions and keep the link to the m-number.
    // await this.manager.delete(GewisUser, gewisUser);

    // Sync deleting a user is quite impactful, so we only do it if the setting is explicitly set.
    if (!await GewisDBSyncService.getAllowDelete()) return;

    const currentBalance = await new BalanceService().getBalance(entity.id);
    await UserService.closeUser(entity.id, true).then(() => {
      this.logger.trace(`User ${entity.id} closed`);
      Mailer.getInstance().send(entity, new MembershipExpiryNotification({
        balance: DineroTransformer.Instance.from(currentBalance.amount.amount),
      }), Language.ENGLISH, { bcc: process.env.FINANCIAL_RESPONSIBLE }).catch((e) => getLogger('User').error(e));
    }).catch((e) => {
      this.logger.error('Syncing error for', entity, e);
    });
  }

  fetch(): Promise<void> {
    // We do not fetch anything.
    return Promise.resolve(undefined);
  }

  static isUpdateNeeded(gewisUser: GewisUser, update: any): boolean {
    return gewisUser.user.firstName !== update.firstName ||
        gewisUser.user.lastName !== update.lastName ||
        gewisUser.user.ofAge !== update.ofAge ||
        gewisUser.user.email !== update.email;
  }
}