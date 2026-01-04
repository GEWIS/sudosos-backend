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

import { NotificationChannel } from './channels/abstract-channel';
import {
  NotificationTypes,
  NotificationType,
  NotificationTypeRegistry,
  TemplateObject,
  TemplateOptions,
} from './notification-types';
import log4js, { Logger } from 'log4js';
import { EmailChannel } from './channels/mail-channel';
import User from '../entity/user/user';
import UserNotificationPreference, { NotificationChannels } from '../entity/notifications/user-notification-preference';
import NotificationLog from '../entity/notifications/notification-log';

/**
 * This is the module page of the notifier.
 *
 * @module notifications
 */

interface NotificationPayload<P> {
  type: NotificationTypes;
  userId: number;
  params: P;
}

export default class Notifier {
  private static instance: Notifier;

  private logger: Logger = log4js.getLogger('Notifier');
    
  constructor(
    private channels: NotificationChannel<any, any, any>[],
  ) {
    this.logger.level = process.env.LOG_LEVEL;
  }

  static getInstance(): Notifier {
    if (this.instance === undefined) {
      const emailChannel = new EmailChannel();

      this.instance = new Notifier([
        emailChannel,
      ]);
    }
    return this.instance;
  }

  async notify<P extends TemplateOptions>(payload: NotificationPayload<P>): Promise<void> {
    const notifyType = NotificationTypeRegistry.get<P>(payload.type);

    if (!notifyType) {
      this.logger.error(`Could not get notify type: ${payload.type}`);
    }

    const user = await User.findOne({ where: { id: payload.userId } });

    if (!user) {
      throw new Error('Could not find user');
    }

    const channelPrefs = new Set<string>();

    if (notifyType.isMandatory) {
      channelPrefs.add(NotificationChannels.EMAIL);
    }

    const userPrefs = await this.getPreferences(user, notifyType.type);
    userPrefs.forEach(pref => channelPrefs.add(pref));

    const channelsToUse = this.channels.filter(ch =>
      channelPrefs.has(ch.name),
    );

    if (channelsToUse.length === 0) {
      await this.noChannelLog(user, payload.type);
      throw new Error('No channel found to send for.');
    }

    await Promise.allSettled(
      channelsToUse.map(ch =>
        this.sendViaChannel(ch, user, notifyType, payload.params),
      ),
    );
  }

  private async getPreferences(user: User, notifyType: NotificationTypes): Promise<string[]> {
    const preferences = await UserNotificationPreference.find({
      where: { userId: user.id, type: notifyType, enabled: true },
      select: ['channel'],
    });

    return preferences.map(p => p.channel);
  }

  private async sendViaChannel<
    P extends TemplateOptions,
    TTemplate extends TemplateObject<P, R>,
    R,
  >(
    channel: NotificationChannel<TTemplate, P, R>,
    user: User,
    notifyType: NotificationType<P>,
    params: P,
  ) {
    const template = channel.getTemplate(notifyType.type);
    if (!template) {
      this.logger.error(`Channel ${channel.constructor.name} has not implemented ${notifyType.type}.`);
      return;
    }

    const rendered = await channel.apply(template, params);
    try {
      await channel.log(user, notifyType.type);

      await channel.send(user, rendered);
    } catch (error) {
      throw error;
    }
  }

  private async noChannelLog(user: User, code: NotificationTypes): Promise<void> {
    await NotificationLog.create({
      user: user,
      handler: null,
      type: code,
    }).save();
  }
}