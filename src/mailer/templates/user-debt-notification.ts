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
import { Dinero } from 'dinero.js';
import MailContent from './mail-content';
import { signatureDutch, signatureEnglish } from './signature';
import MailTemplate, { Language, MailLanguageMap } from './mail-template';

interface UserDebtNotificationOptions {
  name: string;
  url: string;
  balance: Dinero;
}

const userDebtNotificationDutch = new MailContent<UserDebtNotificationOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Volgens onze administratie heb je momenteel een schuld bij SudoSOS.<br>
Het gaat hierbij om een bedrag van:<br>
<span style="color: red; font-weight: bold; font-size: 20px">${context.balance.toFormat()}</span>.</p>

<p>Ga snel naar de SudoSOS website om je saldo op te hogen! Zo voorkom je dat je een boete krijgt.</p>

${signatureDutch}`,
  getSubject: () => 'Je hebt een SudoSOS schuld!',
  getText: (context) => `
Beste ${context.name},

Volgens onze administratie heb je momenteel een schuld bij SudoSOS.
Het gaat hierbij om een bedrag van:
${context.balance.toFormat()}

Ga snel naar de SudoSOS website(https://sudosos.gewis.nl) om je saldo op te hogen! Zo voorkom je dat je een boete krijgt.

Tot op de borrel!

Met vriendelijke groet,
SudoSOS`,
});

const userDebtNotificationEnglish = new MailContent<UserDebtNotificationOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>

<p>Accoring to our administration, you currently have a balance of <span style="color: red; font-weight: bold">${context.balance.toFormat()}</span>.</p>

<p>Go to the SudoSOS website to deposit money into your account. With this you prevent getting fined into the future.</p>

${signatureEnglish}`,
  getSubject: () => 'You have a SudoSOS debt',
  getText: (context) => `
Dear ${context.name},

Accoring to our administration, you currently have a balance of ${context.balance.toFormat()}.

Go to the  <a href="https://sudosos.gewis.nl">SudoSOS website</a> to deposit money into your account. With this you prevent getting fined into the future.

See you at the borel!

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<UserDebtNotificationOptions> = {
  [Language.DUTCH]: userDebtNotificationDutch,
  [Language.ENGLISH]: userDebtNotificationEnglish,
};

export default class UserDebtNotification extends MailTemplate<UserDebtNotificationOptions> {
  public constructor(options: UserDebtNotificationOptions) {
    const opt: UserDebtNotificationOptions = { ...options };
    if (!options.url) {
      opt.url = process.env.url;
    }
    super(opt, mailContents);
  }
}
