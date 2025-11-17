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

import { NotificationChannel } from './channels/abstract-channel';
import { NotificationType, NotificationTypeRegistry, ParameterObject, TemplateObject } from './notification-types';
import log4js, { Logger } from 'log4js';
import UserService from '../service/user-service';
import { EmailChannel } from './channels/mail-channel';
import User from '../entity/user/user';

/**
 * This is the module page of the notifier.
 *
 * @module internal/notifications
 */

interface NotificationPayload<P> {
  type: string;
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

  async notify<P extends ParameterObject>(payload: NotificationPayload<P>): Promise<void> {
    const notifyType = NotificationTypeRegistry.get<P>(payload.type);
    this.logger.info(NotificationTypeRegistry.list());
    if (!notifyType) {
      this.logger.error(`Could not get notify type: ${payload.type}`);
    }

    const user = await User.findOne({ where: { id: payload.userId } });

    const channelsToUse = [
      this.channels.find(ch => ch.constructor.name === 'EmailChannel')!,
    ];

    await Promise.allSettled(
      channelsToUse.map(ch =>
        this.sendViaChannel(ch as any, user, notifyType, payload.params),
      ),
    );
  }

  private async sendViaChannel<
    P extends ParameterObject,
    TTemplate extends TemplateObject<P, R>,
    R,
  >(
    channel: NotificationChannel<TTemplate, P, R>,
    user: User,
    notifyType: NotificationType<P>,
    params: P,
  ) {
    const template = channel.getTemplate(notifyType.code);
    if (!template) {
      this.logger.error(`Channel ${channel.constructor.name} has not implemented ${notifyType.code}.`);
    }

    const rendered = await channel.apply(template, params);

    await channel.send(user, rendered);
  }
}