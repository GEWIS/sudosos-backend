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
import MailContentBuilder from './mail-content-builder';

interface WelcomeToSudososOptions {
  url?: string;
}

const welcomeToSudososDutch = new MailContentBuilder<WelcomeToSudososOptions>({
  getHTML: (context) => `
<p>Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!</p>

<p>Voordat je SudoSOS écht kunt gebruiken, dien je de voorwaarden van SudoSOS te accepteren. Je kunt deze vinden en accepteren door in te loggen op ${context.url}. Vergeet ook niet gelijk wat saldo op je account te zetten!</p>

<p>Tot op de borrel!</p>`,
  getSubject: 'Welkom bij SudoSOS!',
  getTitle: 'Welkom!',
  getText: (context) => `
Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!

Voordat je SudoSOS écht kunt gebruiken, dien je de voorwaarden van SudoSOS te accepteren. Je kunt deze vinden en accepteren door in te loggen op ${context.url}. Vergeet ook niet gelijk wat saldo op je account te zetten!

Tot op de borrel!`,
});

const welcomeToSudososEnglish = new MailContentBuilder<WelcomeToSudososOptions>({
  getHTML: (context) => `
<p>An account for SudoSOS has just been created for you. Welcome!</p>

<p>Before you can actually use SudoSOS, you have to accept the terms of service. You can find and accept these by logging in at ${context.url}. While you're there, don't forget to deposit some money into your account!</p>

<p>See you on the borrel!</p>`,
  getSubject: 'Welcome to SudoSOS!',
  getTitle: 'Welcome!',
  getText: (context) => `
An account for SudoSOS has just been created for you. Welcome!

Before you can actually use SudoSOS, you have to accept the terms of service. You can find and accept these by logging in at ${context.url}. While you're there, don't forget to deposit some money into your account!

See you on the borrel!`,
});

const mailContents: MailLanguageMap<WelcomeToSudososOptions> = {
  [Language.DUTCH]: welcomeToSudososDutch,
  [Language.ENGLISH]: welcomeToSudososEnglish,
};

export default class WelcomeToSudosos extends MailMessage<WelcomeToSudososOptions> {
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
