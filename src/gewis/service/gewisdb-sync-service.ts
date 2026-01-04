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
 * This is the module page of the gewis-db-sync-service.
 *
 * @module GEWIS/gewis-db-sync-service
 */

import { UserSyncService } from '../../service/sync/user/user-sync-service';
import User, { UserType } from '../../entity/user/user';
import log4js, { Logger } from 'log4js';
import MemberUser from '../../entity/user/member-user';
import { webResponseToUpdate } from '../helpers/gewis-helper';
import BalanceService from '../../service/balance-service';
import UserService from '../../service/user-service';
import DineroTransformer from '../../entity/transformer/dinero-transformer';
import { BasicApi, Configuration, MembersApi } from 'gewisdb-ts-client';
import ServerSettingsStore from '../../server-settings/server-settings-store';
import { ISettings } from '../../entity/server-setting';
import { EntityManager } from 'typeorm';
import Notifier, { MembershipExpiryNotificationOptions } from '../../notifications';
import { NotificationTypes } from '../../notifications/notification-types';
import { NotificationChannels } from '../../entity/notifications/user-notification-preference';

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
    
    const memberUser = await this.manager.findOne(MemberUser, { where: { user: { id: entity.id } }, relations: ['user'] });
    return !!memberUser;
  }

  async pre(): Promise<void> {
    const ping = await this.pinger.healthGet().then(health => health.data);
    const ready = ping.sync_paused === false && ping.healthy === true;
    if (!ready) {
      throw new Error('GEWISDB is not ready for syncing');
    }
  }

  async sync(entity: User, isDryRun: boolean = false): Promise<boolean> {
    const memberUser = await this.manager.findOne(MemberUser, { where: { user: { id: entity.id } }, relations: ['user'] });
    if (!memberUser) {
      throw new Error('Member User not found.');
    }

    const dbMember = await this.api.membersLidnrGet(memberUser.memberId).then(member => member.data.data);
    if (!dbMember) return false;

    const expirationDate = new Date(dbMember.expiration);
    const expired = new Date() > expirationDate;

    if (expired) {
      this.logger.log(`User ${memberUser.memberId} has expired.`);
      return false;
    }

    if (dbMember.deleted) {
      this.logger.log(`User ${memberUser.memberId} is deleted.`);
      return false;
    }

    const update = webResponseToUpdate(dbMember);
    if (GewisDBSyncService.isUpdateNeeded(memberUser, update)) {
      this.logger.log(`Updating user m${memberUser.memberId} (id ${memberUser.userId}) with `, update);
      const user = memberUser.user;
      user.firstName = update.firstName;
      user.lastName = update.lastName;
      user.email = update.email;
      user.ofAge = update.ofAge;
      user.active = true;
      
      if (!isDryRun) {
        await this.manager.save(user);
      }
      return true;
    }
    return true;
  }

  private static async getAllowDelete(): Promise<boolean> {
    return ServerSettingsStore.getInstance().getSetting('allowGewisSyncDelete') as ISettings['allowGewisSyncDelete'];
  }

  async down(entity: User, isDryRun: boolean = false): Promise<void> {
    const memberUser = await this.manager.findOne(MemberUser, { where: { user: { id: entity.id } } });
    if (!memberUser) return;
    
    // We do not delete the MemberUser, for if we ever want to undo deletions and keep the link to the m-number.
    // await this.manager.delete(MemberUser, memberUser);

    // Sync deleting a user is quite impactful, so we only do it if the setting is explicitly set.
    if (!await GewisDBSyncService.getAllowDelete()) return;

    const currentBalance = await new BalanceService().getBalance(entity.id);
    const shouldDelete = currentBalance.amount.amount === 0;

    try {
      this.logger.trace(`Down user ${entity.id}, with balance ${currentBalance.amount.amount} (should delete: ${shouldDelete})`);
      
      if (!isDryRun) {
        const oldActive = entity.active;
        const u = await UserService.closeUser(entity.id, shouldDelete);

        // If the user was active, and is now inactive, we send a notification
        const isFallingEdge = oldActive !== u.active && u.active === false;

        // Send notification to user
        if (!shouldDelete && isFallingEdge) {
          this.logger.trace(`User ${u.id} closed`);
          await Notifier.getInstance().notify({
            type: NotificationTypes.MembershipExpiryNotification,
            userId: entity.id,
            params: new MembershipExpiryNotificationOptions(
              DineroTransformer.Instance.from(currentBalance.amount.amount),
            ),
          });
        }
      }
    } catch (e) {
      this.logger.error(`Down user ${entity.id} failed with error ${e}`);
    }
  }

  fetch(): Promise<void> {
    // We do not fetch anything.
    return Promise.resolve(undefined);
  }

  static isUpdateNeeded(memberUser: MemberUser, update: any): boolean {
    return memberUser.user.firstName !== update.firstName ||
        memberUser.user.lastName !== update.lastName ||
        memberUser.user.ofAge !== update.ofAge ||
        memberUser.user.email !== update.email ||
        !memberUser.user.active;
  }
}