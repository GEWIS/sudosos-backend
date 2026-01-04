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

import { Dinero } from 'dinero.js';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import { UserGotInactiveAdministrativeCostOptions } from '../../notifications/notification-options';


/**
 * This is the module page of the user-got-inactive-administrative-cost.
 *
 * @module internal/mailer
 */

const formatBalance = (b: Dinero) => {
  return `<span style="font-weight: bold;">${b.toFormat()}</span>`;
};

const userGotInactiveAdministrativeCostDutch = new MailContentBuilder<UserGotInactiveAdministrativeCostOptions>({
  getHTML: (context) => `
  <p> Je hebt al 3 jaar geen overdrachten binnen SudoSOS gedaan. Dit betekent dat je administratie kosten gaat betalen.<br>
  Er wordt ${formatBalance(context.amount)} van je account worden afgehaald ter betaling voor administratie kosten.
  
  `,
  getSubject: () => 'Administratie kosten SudoSOS',
  getTitle: 'Administratie kosten',
  getText: (context) => `
  Je hebt al 3 jaar geen overdrachten binnen SudoSOS gedaan. Dit betekent dat je administratie kosten gaat betalen.
  Er wordt ${formatBalance(context.amount)} van je account worden afgehaald ter betaling voor administratie kosten.
  `,
});

const userGotInactiveAdministrativeCostEnglish = new MailContentBuilder<UserGotInactiveAdministrativeCostOptions>({
  getHTML: (context) => `
  <p> You haven't made any transfers on SudoSOS for the last 3 years. This means that you will pay an administration fee.<br>
  This means that ${formatBalance(context.amount)} will be deducted from your account. 
  `,
  getSubject: () => 'Administration costs SudoSOS',
  getTitle: 'Administration costs',
  getText: (context) => `
  You haven't made any transfers on SudoSOS for the last 3 years. This means that you will pay an administration fee.
  This means that ${formatBalance(context.amount)} will be deducted from your account.
  `,
});

const mailContents: MailLanguageMap<UserGotInactiveAdministrativeCostOptions> = {
  [Language.DUTCH]: userGotInactiveAdministrativeCostDutch,
  [Language.ENGLISH]: userGotInactiveAdministrativeCostEnglish,
};

export default class UserGotInactiveAdministrativeCost extends MailMessage<UserGotInactiveAdministrativeCostOptions> {
  public constructor(options: UserGotInactiveAdministrativeCostOptions) {
    super(options, mailContents);
  }
}