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
 * This is the module page of the user-account-expired.
 *
 * @module internal/mailer
 */

import { UserAccountExpiredOptions } from '../../notifications/notification-options';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';

const financialResponsible = process.env.FINANCIAL_RESPONSIBLE;

const userAccountExpiredDutch = new MailContentBuilder<UserAccountExpiredOptions>({
  getHTML: (context) => `
<p>Wij willen u informeren dat uw account bij SudoSOS is verlopen op <strong>${context.expiryDate.toLocaleDateString('nl-NL')}</strong>.</p>

<p>Uw account is nu gedeactiveerd en u heeft geen toegang meer tot SudoSOS. Als u uw toegang wilt herstellen, kunt u contact opnemen met de penningmeester van de BAr Commissie via <a href="mailto:${financialResponsible}">${financialResponsible}</a>.</p>`,
  getSubject: 'Uw SudoSOS-account is verlopen',
  getTitle: 'Account verlopen',
  getText: (context) => `
Wij willen u informeren dat uw account bij SudoSOS is verlopen op ${context.expiryDate.toLocaleDateString('nl-NL')}.

Uw account is nu gedeactiveerd en u heeft geen toegang meer tot SudoSOS. Als u uw toegang wilt herstellen, kunt u contact opnemen met de penningmeester van de BAr Commissie via ${financialResponsible}.`,
});

const userAccountExpiredEnglish = new MailContentBuilder<UserAccountExpiredOptions>({
  getHTML: (context) => `
<p>We would like to inform you that your SudoSOS account has expired on <strong>${context.expiryDate.toLocaleDateString('en-GB')}</strong>.</p>

<p>Your account has been deactivated and you no longer have access to SudoSOS. If you would like to restore your access, please contact the Treasurer of the BAr Committee via <a href="mailto:${financialResponsible}">${financialResponsible}</a>.</p>`,
  getSubject: 'Your SudoSOS account has expired',
  getTitle: 'Account expired',
  getText: (context) => `
We would like to inform you that your SudoSOS account has expired on ${context.expiryDate.toLocaleDateString('en-GB')}.

Your account has been deactivated and you no longer have access to SudoSOS. If you would like to restore your access, please contact the Treasurer of the BAr Committee via ${financialResponsible}.`,
});

const mailContents: MailLanguageMap<UserAccountExpiredOptions> = {
  [Language.DUTCH]: userAccountExpiredDutch,
  [Language.ENGLISH]: userAccountExpiredEnglish,
};

export default class UserAccountExpired extends MailMessage<UserAccountExpiredOptions> {
  public constructor(options: UserAccountExpiredOptions) {
    super(options, mailContents);
  }
}

