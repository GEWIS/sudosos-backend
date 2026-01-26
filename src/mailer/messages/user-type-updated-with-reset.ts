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
  UserTypeUpdatedWithResetOptions,
} from '../../notifications/notification-options';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';

/**
 * This is the module page of the user-type-updated.
 *
 * @module internal/mailer
 */

const userTypeUpdatedWithResetDutch = new MailContentBuilder<UserTypeUpdatedWithResetOptions>({
  getHTML: (context) => {
    const link = context.url + '/passwordreset?email=' + context.email;
    return `
<p>Het type van je account is gewijzigd van ${context.fromType} naar ${context.toType}.</p>

<p>Om het proces te voltooien moet je een wachtwoord instellen.</p>

<p><a href="${link}">Wachtwoord instellen</a></p>

<p> Of plak de volgende link in je browser: ${link}</p>`;
  },
  getSubject: 'Account type gewijzigd - Wachtwoord instellen',
  getTitle: 'Account type gewijzigd',
  getText: (context) => `
Het type van je account is gewijzigd van ${context.fromType} naar ${context.toType}. 

Om het proces te voltooien moet je een wachtwoord instellen.

${context.url + '/passwordreset?email=' + context.email}
`,
});

const userTypeUpdatedWithResetEnglish = new MailContentBuilder<UserTypeUpdatedWithResetOptions>({
  getHTML: (context) => {
    const link = context.url + '/passwordreset?email=' + context.email;
    return `
<p>The type of your account has been changed from ${context.fromType} to ${context.toType}.</p>

<p>To complete the process, you need to set a password.</p>

<p><a href="${link}">Set Password</a></p>

<p>Or paste the following link into your browser: ${link}</p>`;
  },
  getSubject: 'Account Type Changed - Set Password',
  getTitle: 'Account Type Changed',
  getText: (context) => `
The type of your account has been changed from ${context.fromType} to ${context.toType}. 

To complete the process, you need to set a password.

${context.url + '/passwordreset?email=' + context.email}
`,
});

const mailContents: MailLanguageMap<UserTypeUpdatedWithResetOptions> = {
  [Language.DUTCH]: userTypeUpdatedWithResetDutch,
  [Language.ENGLISH]: userTypeUpdatedWithResetEnglish,
};

export default class UserTypeUpdatedWithReset extends MailMessage<UserTypeUpdatedWithResetOptions> {
  public constructor(options: UserTypeUpdatedWithResetOptions) {
    const opt: UserTypeUpdatedWithResetOptions = {
      ...options,
    };
    if (!options.url) {
      opt.url = process.env.url;
    }
    super(opt, mailContents);
  }
}
