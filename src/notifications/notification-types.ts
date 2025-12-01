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
 * This is the module page of the notification-types.
 *
 * @module notification
 *
 */

import MailMessage from '../mailer/mail-message';

export class TemplateOptions {
}

export interface TemplateObject<P extends TemplateOptions, R> {
  build(params: P): R;
}

export class EmailTemplate<P extends TemplateOptions> implements TemplateObject<P, MailMessage<P>> {
  constructor(
    private readonly templateFactory: (params: P) => MailMessage<P>,
  ) {}

  build(params: P): MailMessage<P> {
    return this.templateFactory(params);
  }
}

export enum NotificationTypes {
  ChangedPin = 'ChangedPin',
  ForgotEventPlanning = 'ForgotEventPlanning',
  HelloWorld = 'HelloWorld',
  InactiveAdministrativeCostNotification = 'InactiveAdministrativeCostNotification',
  MembershipExpiryNotification = 'MembershipExpiryNotification',
  PasswordReset = 'PasswordReset',
  UserDebtNotification = 'UserDebtNotification',
  UserGotFined = 'UserGotFined',
  UserGotInactiveAdministrativeCost = 'UserGotInactiveAdministrativeCost',
  UserWillGetFined = 'UserWillGetFined',
  WelcomeToSudosos = 'WelcomeToSudosos',
  WelcomeWithReset = 'WelcomeWithReset',
}

export interface NotificationType<P extends TemplateOptions = any> {
  type: NotificationTypes;
  paramClass: new (...args: any[]) => P;
  isMandatory: boolean;
}

export class NotificationTypeRegistry {
  private static types = new Map<string, NotificationType<any>>();

  static register<P extends TemplateOptions>(type: NotificationType<P>): void {
    this.types.set(type.type, type);
  }

  static get<P extends TemplateOptions = any>(code: string): NotificationType<P | undefined> {
    return this.types.get(code);
  }

  static has(code: string): boolean {
    return this.types.has(code);
  }

  static list(): Map<string, NotificationType<any>> {
    return this.types;
  }
}


