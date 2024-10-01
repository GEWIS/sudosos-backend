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

import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';

/**
 * This is the module page of the inactive-administrative-cost-notification.
 *
 * @module internal/mailer
 */

interface InactiveAdministrativeCostNotificationOptions {

}

const inactiveAdministrativeCostNotificationDutch = new MailContentBuilder<InactiveAdministrativeCostNotificationOptions>({
  getHTML: () => `
  <p> Je hebt al 2 jaar geen overdrachten binnen SudoSOS gedaan. Dit betekent dat je volgend jaar administratie kosten zal betalen.<br>
  Er zal dan 5 euro van je account worden afgehaald ter betaling vor administratie kosten. </p>
  `,
  getSubject: () => 'Notificatie administratie kosten SudoSOS',
  getTitle: 'Administratienotificatie',
  getText: () => `
  Je hebt al 2 jaar geen overdrachten binnen SudoSOS gedaan. Dit betekent dat je volgend jaar administratie kosten zal betalen.
  Er zal dan 5 euro van je account worden afgehaald ter betaling vor administratie kosten. 
  `,
});

const inactiveAdministrativeCostNotificationEnglish = new MailContentBuilder<InactiveAdministrativeCostNotificationOptions>({
  getHTML: () => `
  <p> You haven't made any transfers on SudoSOS for the last 2 years. This means that next year you will pay an administration fee.<br>
  This means that 5 euros will be deducted from your account. </p>
  `,
  getSubject: () => 'Notification administration costs SudoSOS',
  getTitle: 'Administrationnotification',
  getText: () => `
  You haven't made any transfers on SudoSOS for the last 2 years. This means that next year you will pay an administration fee.
  This means that 5 euros will be deducted from your account. 
  `,
});

const mailContents: MailLanguageMap<InactiveAdministrativeCostNotificationOptions> = {
  [Language.DUTCH]: inactiveAdministrativeCostNotificationDutch,
  [Language.ENGLISH]: inactiveAdministrativeCostNotificationEnglish,
};

export default class InactiveAdministrativeCostNotification extends MailMessage<InactiveAdministrativeCostNotificationOptions> {
  public constructor(options: InactiveAdministrativeCostNotificationOptions) {
    super(options, mailContents);
  }
}