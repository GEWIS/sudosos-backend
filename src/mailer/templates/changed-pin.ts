/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
import AbstractMailTemplate from './abstract-mail-template';
import { signatureDutch, signatureEnglish } from './signature';

interface ChangedPinOptions {
  name: string;
}

export default class ChangedPin extends AbstractMailTemplate<ChangedPinOptions> {
  protected getHTMLDutch(): string {
    return `<p>Beste ${this.contentOptions.name},</p>

<p>Je pincode van je account in SudoSOS is zojuist veranderd.</p>

${signatureDutch}`;
  }

  protected getHTMLEnglish(): string {
    return `<p>Dear ${this.contentOptions.name},</p>

<p>The PIN number of your account in SudoSOS has just been changed.</p>

${signatureEnglish}`;
  }

  protected getTextDutch(): string {
    return `Beste ${this.contentOptions.name},

Je pincode van je account in SudoSOS is zojuist veranderd.

Met vriendelijke groet,
SudoSOS`;
  }

  protected getTextEnglish(): string {
    return `Dear ${this.contentOptions.name},

The PIN number of your account in SudoSOS has just been changed.

Kind regards,
SudoSOS`;
  }

  protected getSubjectDutch(): string {
    return 'Je pincode is veranderd';
  }

  protected getSubjectEnglish(): string {
    return 'Your PIN has changed';
  }
}
