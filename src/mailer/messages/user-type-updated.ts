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

import { UserTypeUpdatedOptions } from '../../notifications/notification-options';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';

/**
 * This is the module page of the user-type-updated.
 *
 * @module internal/mailer
 */

const userTypeUpdatedDutch = new MailContentBuilder<UserTypeUpdatedOptions>({
  getHTML: (context) => {
    return `
<p>Het type van je account is gewijzigd van ${context.fromType} naar ${context.toType}.</p>`;
  },
  getSubject: 'Account type gewijzigd',
  getTitle: 'Account type gewijzigd',
  getText: (context) => `
Het type van je account is gewijzigd van ${context.fromType} naar ${context.toType}.`,
});

const userTypeUpdatedEnglish = new MailContentBuilder<UserTypeUpdatedOptions>({
  getHTML: (context) => {
    return `
<p>The type of your account has been changed from ${context.fromType} to ${context.toType}.</p>`;
  },
  getSubject: 'Account Type Changed',
  getTitle: 'Account Type Changed',
  getText: (context) => `
The type of your account has been changed from ${context.fromType} to ${context.toType}.`,
});

const mailContents: MailLanguageMap<UserTypeUpdatedOptions> = {
  [Language.DUTCH]: userTypeUpdatedDutch,
  [Language.ENGLISH]: userTypeUpdatedEnglish,
};

export default class UserTypeUpdated extends MailMessage<UserTypeUpdatedOptions> {
  public constructor(options: UserTypeUpdatedOptions) {
    const opt: UserTypeUpdatedOptions = {
      ...options,
    };
    super(opt, mailContents);
  }
}
