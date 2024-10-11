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

interface UserToLocalUserOptions {
  email: string,
  resetTokenInfo: ResetTokenInfo,
  url?: string;
}

const userToLocalUserDutch = new MailContentBuilder<UserToLocalUserOptions>({
  getHTML: (context) => `
<p>Je account is veranderd zodat je zonder GEWIS account kan inloggen.</p>

<p>Voordat je SudoSOS weer kunt gebruiken, dien je een wachtwoord te kiezen door te gaan naar ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}</p>

<p>Tot op de borrel!</p>`,
  getSubject: 'Welkom bij SudoSOS!',
  getTitle: 'Welkom!',
  getText: (context) => `
Je account is omgezet zodat je zonder GEWIS account kan inloggen.

Voordat je SudoSOS weer kunt gebruiken, dien je een wachtwoord te kiezen door te gaan naar ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

Tot op de borrel!`,
});

const userToLocalUserEnglish = new MailContentBuilder<UserToLocalUserOptions>({
  getHTML: (context) => `
<p>Your account has changed such that you can login without having a GEWIS account.</p>

<p>Before you can actually use SudoSOS again, you have to set a password by going to ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}</p>

<p>See you on the borrel!</p>`,
  getSubject: 'Welcome to SudoSOS!',
  getTitle: 'Welcome!',
  getText: (context) => `
Your account has changed such that you can login without having a GEWIS account.

Before you can actually use SudoSOS again, you have to set a password by going to ${context.url + '/passwordreset?token=' + context.resetTokenInfo.password + '&email=' + context.email}

See you on the borrel!`,
});

const mailContents: MailLanguageMap<WelcomeWithResetOptions> = {
  [Language.DUTCH]: userToLocalUserDutch,
  [Language.ENGLISH]: userToLocalUserEnglish,
};

export default class UserToLocalUser extends MailMessage<UserToLocalUserOptions> {
  public constructor(options: UserToLocalUserOptions) {
    const opt: UserToLocalUserOptions = {
      ...options,
    };
    if (!options.url) {
      opt.url = process.env.url;
    }
    super(opt, mailContents);
  }
}
