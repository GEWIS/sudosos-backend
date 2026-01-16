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
import {
  ChangedPinOptions,
  ForgotEventPlanningOptions,
  HelloWorldOptions,
  InactiveAdministrativeCostNotificationOptions,
  MembershipExpiryNotificationOptions,
  TransactionNotificationOptions,
  UserDebtNotificationOptions,
  UserGotFinedOptions,
  UserGotInactiveAdministrativeCostOptions,
  UserWillGetFinedOptions,
  WelcomeToSudososOptions,
  WelcomeWithResetOptions,
} from '../notification-options';
import UserWillGetFined from '../../mailer/messages/user-will-get-fined';
import { EmailTemplate } from '../notification-types';
import ForgotEventPlanning from '../../mailer/messages/forgot-event-planning';
import ChangedPin from '../../mailer/messages/changed-pin';
import HelloWorld from '../../mailer/messages/hello-world';
import MembershipExpiryNotification from '../../mailer/messages/membership-expiry-notification';
import WelcomeWithReset from '../../mailer/messages/welcome-with-reset';
import UserDebtNotification from '../../mailer/messages/user-debt-notification';
import UserGotInactiveAdministrativeCost from '../../mailer/messages/user-got-inactive-administrative-cost';
import WelcomeToSudosos from '../../mailer/messages/welcome-to-sudosos';
import InactiveAdministrativeCostNotification from '../../mailer/messages/inactive-administrative-cost-notification';
import UserGotFined from '../../mailer/messages/user-got-fined';
import TransactionNotification from '../../mailer/messages/transaction-notification';

export const ChangedPinTemplate = new EmailTemplate(
  (params: ChangedPinOptions) => new ChangedPin(params),
);

export const ForgotEventPlanningTemplate = new EmailTemplate(
  (params: ForgotEventPlanningOptions) => new ForgotEventPlanning(params),
);

export const HelloWorldTemplate = new EmailTemplate(
  (params: HelloWorldOptions) => new HelloWorld(params),
);

export const InactiveAdministrativeCostNotificationTemplate = new EmailTemplate(
  (params: InactiveAdministrativeCostNotificationOptions) => new InactiveAdministrativeCostNotification(params),
);

export const MembershipExpiryNotificationTemplate = new EmailTemplate(
  (params: MembershipExpiryNotificationOptions) => new MembershipExpiryNotification(params),
);

export const PasswordResetTemplate = new EmailTemplate(
  (params: WelcomeWithResetOptions) => new WelcomeWithReset(params),
);

export const UserDebtNotificationTemplate = new EmailTemplate(
  (params: UserDebtNotificationOptions) => new UserDebtNotification(params),
);

export const UserGotFinedTemplate = new EmailTemplate(
  (params: UserGotFinedOptions) => new UserGotFined(params),
);

export const UserGotInactiveAdministrativeCostTemplate = new EmailTemplate(
  (params: UserGotInactiveAdministrativeCostOptions) => new UserGotInactiveAdministrativeCost(params),
);

export const UserWillGetFinedTemplate = new EmailTemplate(
  (params: UserWillGetFinedOptions) => new UserWillGetFined(params),
);

export const WelcomeToSudososTemplate = new EmailTemplate(
  (params: WelcomeToSudososOptions) => new WelcomeToSudosos(params),
);

export const WelcomeWithResetTemplate = new EmailTemplate(
  (params: WelcomeWithResetOptions) => new WelcomeWithReset(params),
);

export const TransactionNotificationTemplate = new EmailTemplate(
  (params: TransactionNotificationOptions) => new TransactionNotification(params),
);
