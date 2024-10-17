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
 *
 *  @license
 */

/**
 * This is the module page of the welcome-with-reset.
 *
 * @module internal/mailer
 */

import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import MailContentBuilder from './mail-content-builder';
import { ResetTokenInfo } from '../../service/authentication-service';

interface WelcomeWithResetOptions {
  email: string,
  resetTokenInfo: ResetTokenInfo,
  url?: string;
}

const welcomeWithResetDutch = new MailContentBuilder<WelcomeWithResetOptions>({
  getHTML: (context) => `
<p>Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!</p>

<p>Voordat je SudoSOS écht kunt gebruiken, dien je een wachtwoord te kiezen door te gaan naar ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}</p>

<p>Tot op de borrel!</p>`,
  getSubject: 'Welkom bij SudoSOS!',
  getTitle: 'Welkom!',
  getText: (context) => `
Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!

Voordat je SudoSOS écht kunt gebruiken, dien je een wachtwoord te kiezen door te gaan naar ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

Tot op de borrel!`,
});

const welcomeWithResetEnglish = new MailContentBuilder<WelcomeWithResetOptions>({
  getHTML: (context) => `
<p>An account for SudoSOS has just been created for you. Welcome!</p>

<p>Before you can actually use SudoSOS, you have to set a password by going to ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}</p>

<p>See you on the borrel!</p>`,
  getSubject: 'Welcome to SudoSOS!',
  getTitle: 'Welcome!',
  getText: (context) => `
An account for SudoSOS has just been created for you. Welcome!

Before you can actually use SudoSOS, you have to set a password by going to ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

See you on the borrel!`,
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
