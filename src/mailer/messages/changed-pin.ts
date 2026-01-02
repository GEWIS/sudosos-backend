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
 * This is the module page of the changed-pin.
 *
 * @module internal/mailer
 */

import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import MailContentBuilder from './mail-content-builder';

interface ChangedPinOptions {}

const changedPinDutch = new MailContentBuilder<ChangedPinOptions>({
  getHTML: '<p>De pincode van je account in SudoSOS is zojuist veranderd.</p>',
  getSubject: 'Je pincode is veranderd',
  getText: 'De pincode van je account in SudoSOS is zojuist veranderd.',
  getTitle: 'PIN gewijzigd',
});

const changedPinEnglish = new MailContentBuilder<ChangedPinOptions>({
  getSubject: 'Your PIN has changed',
  getText: 'The PIN number of your account in SudoSOS has just been changed.',
  getHTML: '<p>The PIN number of your account in SudoSOS has just been changed.</p>',
  getTitle: 'PIN changed',
});

const mailContents: MailLanguageMap<ChangedPinOptions> = {
  [Language.DUTCH]: changedPinDutch,
  [Language.ENGLISH]: changedPinEnglish,
};

export default class ChangedPin extends MailMessage<ChangedPinOptions> {
  public constructor(options: ChangedPinOptions) {
    super(options, mailContents);
  }
}
