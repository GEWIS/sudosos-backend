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

import { NotificationChannel } from './abstract-channel';
import User from '../../entity/user/user';
import { EmailTemplate, TemplateOptions } from '../notification-types';
import Mailer from '../../mailer';
import MailMessage from '../../mailer/mail-message';
import { NotificationChannels } from '../../entity/notifications/user-notification-preference';
import {
  ChangedPinTemplate,
  ForgotEventPlanningTemplate, HelloWorldTemplate,
  InactiveAdministrativeCostNotificationTemplate,
  MembershipExpiryNotificationTemplate,
  PasswordResetTemplate, UserDebtNotificationTemplate, UserGotFinedTemplate, UserGotInactiveAdministrativeCostTemplate,
  UserWillGetFinedTemplate, WelcomeToSudososTemplate, WelcomeWithResetTemplate,
} from '../templates/notification-email-templates';

/**
 * This is the module page of the mail-channel.
 *
 * @module notifications
 */

export class EmailChannel extends NotificationChannel<
EmailTemplate<any>,
TemplateOptions,
MailMessage<EmailTemplate<any>>
> {
  readonly templates = {
    ChangedPin: ChangedPinTemplate,
    ForgotEventPlanning: ForgotEventPlanningTemplate,
    HelloWorld: HelloWorldTemplate,
    InactiveAdministrativeCostNotification: InactiveAdministrativeCostNotificationTemplate,
    MembershipExpiryNotification: MembershipExpiryNotificationTemplate,
    PasswordReset: PasswordResetTemplate,
    UserDebtNotification: UserDebtNotificationTemplate,
    UserGotFined: UserGotFinedTemplate,
    UserGotInactiveAdministrativeCost: UserGotInactiveAdministrativeCostTemplate,
    UserWillGetFined: UserWillGetFinedTemplate,
    WelcomeToSudosos: WelcomeToSudososTemplate,
    WelcomeWithReset: WelcomeWithResetTemplate,
  };

  readonly name = NotificationChannels.EMAIL;

  async apply(template: EmailTemplate<any>, params: TemplateOptions): Promise<MailMessage<EmailTemplate<any>>> {
    return template.build(params);
  }

  async send(user: User, email: MailMessage<EmailTemplate<any>>): Promise<void> {
    await Mailer.getInstance().send(user, email);
  }
}