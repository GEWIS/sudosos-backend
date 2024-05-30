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

interface WelcomeToSudososOptions {
  name: string;
  url?: string;
}

const welcomeToSudososDutch = new MailContent<WelcomeToSudososOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!</p>

<p>Voordat je SudoSOS écht kunt gebruiken, dien je de voorwaarden van SudoSOS te accepteren. Je kunt deze vinden en accepteren door in te loggen op ${context.url}. Vergeet ook niet gelijk wat saldo op je account te zetten!</p>

<p>Tot op de borrel!</p>

${signatureDutch}`,
  getSubject: () => 'Welkom bij SudoSOS!',
  getText: (context) => `
Beste ${context.name},

Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!

Voordat je SudoSOS écht kunt gebruiken, dien je de voorwaarden van SudoSOS te accepteren. Je kunt deze vinden en accepteren door in te loggen op ${context.url}. Vergeet ook niet gelijk wat saldo op je account te zetten!

Tot op de borrel!

Met vriendelijke groet,
SudoSOS`,
});

const welcomeToSudososEnglish = new MailContent<WelcomeToSudososOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>

<p>An account for SudoSOS has just been created for you. Welcome!</p>

<p>Before you can actually use SudoSOS, you have to accept the terms of service. You can find and accept these by logging in at ${context.url}. While you're there, don't forget to deposit some money into your account!</p>

<p>See you on the borrel!</p>

${signatureEnglish}`,
  getSubject: () => 'Welcome to SudoSOS!',
  getText: (context) => `
Dear ${context.name},

An account for SudoSOS has just been created for you. Welcome!

Before you can actually use SudoSOS, you have to accept the terms of service. You can find and accept these by logging in at ${context.url}. While you're there, don't forget to deposit some money into your account!

See you on the borrel!

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<WelcomeToSudososOptions> = {
  [Language.DUTCH]: welcomeToSudososDutch,
  [Language.ENGLISH]: welcomeToSudososEnglish,
};

export default class WelcomeToSudosos extends MailTemplate<WelcomeToSudososOptions> {
  public constructor(options: WelcomeToSudososOptions) {
    const opt: WelcomeToSudososOptions = {
      ...options,
    };
    if (!options.url) {
      opt.url = process.env.url;
    }
    super(opt, mailContents);
  }
}
