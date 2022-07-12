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

interface WelcomeToSudososOptions {
  name: string;
  url: string;
}

export default class WelcomeToSudosos extends AbstractMailTemplate<WelcomeToSudososOptions> {
  protected getHTMLDutch(): string {
    return `
<p>Beste ${this.contentOptions.name}</p>,

<p>Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!</p>

<p>Voordat je SudoSOS écht kunt gebruiken, dien je de voorwaarden van SudoSOS te accepteren. Je kunt deze vinden en accepteren door in te loggen op ${this.contentOptions.url}. Vergeet ook niet gelijk wat saldo op je account te zetten!</p>

<p>Tot op de borrel!</p>

${signatureDutch}`;
  }

  protected getHTMLEnglish(): string {
    return `
<p>Dear ${this.contentOptions.name}</p>,

<p>An account for SudoSOS has just been created for you. Welcome!</p>

<p>Before you can actually use SudoSOS, you have to accept the terms of service. You can find and accept these by logging in at ${this.contentOptions}. While you're there, don't forget to deposit some money into your account!</p>

<p>See you on the borrel!</p>

${signatureEnglish}`;
  }

  protected getTextDutch(): string {
    return `
Beste ${this.contentOptions.name},

Er is zojuist een account voor je aangemaakt in SudoSOS. Welkom!

Voordat je SudoSOS écht kunt gebruiken, dien je de voorwaarden van SudoSOS te accepteren. Je kunt deze vinden en accepteren door in te loggen op ${this.contentOptions.url}. Vergeet ook niet gelijk wat saldo op je account te zetten!

Tot op de borrel!

Met vriendelijke groet,
SudoSOS`;
  }

  protected getTextEnglish(): string {
    return `
Dear ${this.contentOptions.name},

An account for SudoSOS has just been created for you. Welcome!

Before you can actually use SudoSOS, you have to accept the terms of service. You can find and accept these by logging in at ${this.contentOptions}. While you're there, don't forget to deposit some money into your account!

See you on the borrel!

Kind regards,
SudoSOS`;
  }

  protected getSubjectDutch(): string {
    return 'Welkom bij SudoSOS!';
  }

  protected getSubjectEnglish(): string {
    return 'Welcome to SudoSOS!';
  }
}
