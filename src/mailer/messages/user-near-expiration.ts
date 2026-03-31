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
 * This is the module page of the user-near-expiration.
 *
 * @module internal/mailer
 */

import { UserNearExpirationOptions } from '../../notifications/notification-options';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';

const financialResponsible = process.env.FINANCIAL_RESPONSIBLE;

const userNearExpirationDutch = new MailContentBuilder<UserNearExpirationOptions>({
  getHTML: (context) => `
<p>Wij willen u informeren dat uw SudoSOS account binnen 30 dagen zal verlopen op <strong>${context.expiryDate.toLocaleDateString('nl-NL')}</strong>.</p>

<p>Als uw account verloopt, heeft u geen toegang meer tot SudoSOS. Om uw toegang te behouden, kunt u contact opnemen met de penningmeester van de BAr Commissie via <a href="mailto:${financialResponsible}">${financialResponsible}</a>.</p>`,
  getSubject: 'Uw SudoSOS-account verloopt binnenkort',
  getTitle: 'Account verloopt binnenkort',
  getText: (context) => `
Wij willen u informeren dat uw SudoSOS account binnen 30 dagen zal verlopen op ${context.expiryDate.toLocaleDateString('nl-NL')}.

Als uw account verloopt, heeft u geen toegang meer tot SudoSOS. Om uw toegang te behouden, kunt u contact opnemen met de penningmeester van de BAr Commissie via ${financialResponsible}.`,
});

const userNearExpirationEnglish = new MailContentBuilder<UserNearExpirationOptions>({
  getHTML: (context) => `
<p>We would like to inform you that your SudoSOS account is set to expire within 30 days, on <strong>${context.expiryDate.toLocaleDateString('en-US')}</strong>.</p>

<p>Once your account expires, you will no longer have access to SudoSOS. To retain your access, please contact the Treasurer of the BAr Committee via <a href="mailto:${financialResponsible}">${financialResponsible}</a>.</p>`,
  getSubject: 'Your SudoSOS account will expire soon',
  getTitle: 'Account expiring soon',
  getText: (context) => `
We would like to inform you that your SudoSOS account is set to expire within 30 days, on ${context.expiryDate.toLocaleDateString('en-US')}.

Once your account expires, you will no longer have access to SudoSOS. To retain your access, please contact the Treasurer of the BAr Committee via ${financialResponsible}.`,
});

const mailContents: MailLanguageMap<UserNearExpirationOptions> = {
  [Language.DUTCH]: userNearExpirationDutch,
  [Language.ENGLISH]: userNearExpirationEnglish,
};

export default class UserNearExpiration extends MailMessage<UserNearExpirationOptions> {
  public constructor(options: UserNearExpirationOptions) {
    super(options, mailContents);
  }
}






