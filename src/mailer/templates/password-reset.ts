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

import MailTemplate, { Language, MailLanguageMap } from './mail-template';
import { signatureDutch, signatureEnglish } from './signature';
import MailContent from './mail-content';
import { ResetTokenInfo } from '../../service/authentication-service';

interface WelcomeWithResetOptions {
  name: string;
  email: string,
  resetTokenInfo: ResetTokenInfo,
  url?: string;
}

const passwordResetDutch = new MailContent<WelcomeWithResetOptions>({
  getHTML: (context) => {
    const link = context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email;
    return `
<p>Beste ${context.name},</p>

<p>Een wachtwoord reset voor dit email adres is aangevraagd. Om het proces te voltooien, gebruik de volgende link elk moment binnen de komende 60 minuten: </p>

<p><a href="${link}">Reset Link</a></p>

<p> Of plak de volgende link in je browser: ${link}</p>

<p>Als u geen wachtwoord reset heeft aangevraagd, kunt u deze e-mail veilig negeren en uw huidige inloggegevens gebruiken.</p>

<p>Tot op de borrel!</p>

${signatureDutch}`;
  },
  getSubject: () => 'Wachtwoord resetten',
  getText: (context) => `
Beste ${context.name},

Een wachtwoord reset voor dit email adres is aangevraagd. Om het proces te voltooien, gebruik de volgende link elk moment binnen de komende 60 minuten: 

${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

Als u geen wachtwoord reset heeft aangevraagd, kunt u deze e-mail veilig negeren en uw huidige inloggegevens gebruiken.

Tot op de borrel!

Met vriendelijke groet,
SudoSOS`,
});

const passwordResetEnglish = new MailContent<WelcomeWithResetOptions>({
  getHTML: (context) => {
    const link = context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email;
    return `
<p>Dear ${context.name},</p>

<p>A password reset for this email address has been requested. To complete the process, use the following link any time within the next 60 minutes: </p>

<p><a href="${link}">Reset Link</a></p>

<p> Or paste the following in your browser: ${link}</p>

<p>If you have not requested a password reset, you can safely ignore this email and use your current login information.</p>

<p>See you on the borrel!</p>

${signatureEnglish}`;
  },
  getSubject: () => 'Password reset',
  getText: (context) => `
Dear ${context.name},

A password reset for this email address has been requested. To complete the process, use the following link any time within the next 60 minutes: 

${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

If you have not requested a password reset, you can safely ignore this email and use your current login information.

See you on the borrel!

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<WelcomeWithResetOptions> = {
  [Language.DUTCH]: passwordResetDutch,
  [Language.ENGLISH]: passwordResetEnglish,
};

export default class PasswordReset extends MailTemplate<WelcomeWithResetOptions> {
  public constructor(options: WelcomeWithResetOptions) {
    const opt: WelcomeWithResetOptions = {
      ...options,
    };
    if (!options.url) {
      opt.url = process.env.url;
    }
    super(opt, mailContents);
  }
}
