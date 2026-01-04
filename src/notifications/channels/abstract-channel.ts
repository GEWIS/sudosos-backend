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


import { NotificationTypes, TemplateObject, TemplateOptions } from '../notification-types';
import User from '../../entity/user/user';
import NotificationLog from '../../entity/notifications/notification-log';
import { NotificationChannels } from '../../entity/notifications/user-notification-preference';

/**
 * This is the module page of the abstract-notification-channel.
 *
 * @module notifications
 */

/**
 * A channel capable of delivering a notification (email, signal, SMS, etc.)
 * using a specific template type, parameter type, and rendered output type.
 *
 * @typeParam TTemplate - The template object type that this channel supports.
 *                        Must implement `TemplateObject<TParams, TRendered>`.
 *
 * @typeParam TParams - The parameter type accepted by the template.
 *                      This represents the data object used to fill in template variables.
 *
 * @typeParam TRendered - The type of the *rendered* output after applying a template.
 *                        Example: a MailMessage for email.
 */
export abstract class NotificationChannel<
    TTemplate extends TemplateObject<TParams, TRendered>,
    TParams extends TemplateOptions,
    TRendered,
> {
  abstract readonly templates: Record<string, TTemplate>;

  abstract readonly name: NotificationChannels;

  abstract apply(template: TTemplate, params: TParams): Promise<TRendered>;
  abstract send(user: User, content: TRendered): Promise<void>;

  supports(type: string): boolean {
    return type in this.templates;
  }

  getTemplate(type: string): TTemplate | undefined {
    return this.templates[type];
  }

  async log(user: User, code: NotificationTypes): Promise<void> {
    await NotificationLog.create({
      user: user,
      handler: this.name,
      type: code,
    }).save();
  }
}