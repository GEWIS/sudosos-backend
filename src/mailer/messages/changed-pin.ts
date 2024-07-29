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
 */

import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import { signatureDutch, signatureEnglish } from './signature';
import MailContentBuilder from './mail-content-builder';

interface ChangedPinOptions {
  name: string;
}

const changedPinDutch = new MailContentBuilder<ChangedPinOptions>({
  getHTML: (context) => `<p>Beste ${context.name},</p>

<p>De pincode van je account in SudoSOS is zojuist veranderd.</p>

${signatureDutch}`,
  getSubject: () => 'Je pincode is veranderd',
  getText: (context) => `Beste ${context.name},

De pincode van je account in SudoSOS is zojuist veranderd.

Met vriendelijke groet,
SudoSOS`,
});

const changedPinEnglish = new MailContentBuilder<ChangedPinOptions>({
  getSubject: () => 'Your PIN has changed',
  getText: (context) => `Dear ${context.name},

The PIN number of your account in SudoSOS has just been changed.

Kind regards,
SudoSOS`,
  getHTML: (context) => `<p>Dear ${context.name},</p>

<p>The PIN number of your account in SudoSOS has just been changed.</p>

${signatureEnglish}`,
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
