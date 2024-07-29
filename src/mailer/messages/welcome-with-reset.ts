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
import { ResetTokenInfo } from '../../service/authentication-service';

interface WelcomeWithResetOptions {
  name: string;
  email: string,
  resetTokenInfo: ResetTokenInfo,
  url?: string;
}

const welcomeWithResetDutch = new MailContentBuilder<WelcomeWithResetOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!</p>

<p>Voordat je SudoSOS écht kunt gebruiken, dien je een wachtwoord te kiezen door te gaan naar ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}</p>

<p>Tot op de borrel!</p>

${signatureDutch}`,
  getSubject: () => 'Welkom bij SudoSOS!',
  getText: (context) => `
Beste ${context.name},

Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!

Voordat je SudoSOS écht kunt gebruiken, dien je een wachtwoord te kiezen door te gaan naar ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

Tot op de borrel!

Met vriendelijke groet,
SudoSOS`,
});

const welcomeWithResetEnglish = new MailContentBuilder<WelcomeWithResetOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>

<p>An account for SudoSOS has just been created for you. Welcome!</p>

<p>Before you can actually use SudoSOS, you have to set a password by going to ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}</p>

<p>See you on the borrel!</p>

${signatureEnglish}`,
  getSubject: () => 'Welcome to SudoSOS!',
  getText: (context) => `
Dear ${context.name},

An account for SudoSOS has just been created for you. Welcome!

Before you can actually use SudoSOS, you have to set a password by going to ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

See you on the borrel!

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<WelcomeWithResetOptions> = {
  [Language.DUTCH]: welcomeWithResetDutch,
  [Language.ENGLISH]: welcomeWithResetEnglish,
};

export default class WelcomeWithReset extends MailMessage<WelcomeWithResetOptions> {
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
