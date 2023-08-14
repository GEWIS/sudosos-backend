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

interface UserGotFinedOptions {
  name: string;
  referenceDate: Date;
  fine: Dinero;
  totalFine: Dinero;
  balance: Dinero;
}

const userGotFinedDutch = new MailContent<UserGotFinedOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Op ${context.referenceDate.toLocaleString('nl-NL')} had je een saldo van <span style="color: red; font-weight: bold;">${context.balance.toFormat()}</span>.<br>
Hiervoor heb je zojuist een boete gekregen van ${context.fine.toFormat()}.<br>
Dit brengt je totale boete op:<br>
<span style="color: red; font-weight: bold; font-size: 20px;">${context.totalFine.toFormat()}</span>.</p>

<p>Ga snel naar de SudoSOS website om je saldo op te hogen en je boete te betalen. Zo voorkom je dat de boete meer wordt of je account geblokkeerd wordt.</p>

${signatureDutch}`,
  getSubject: (context) => `Je hebt ${context.fine.toFormat()} SudoSOS boete gekregen!`,
  getText: (context) => `
Beste ${context.name},

Op ${context.referenceDate.toLocaleString('nl-NL')} had je een saldo van ${context.balance.toFormat()}.
Hiervoor heb je zojuist een boete gekregen van ${context.fine.toFormat()}.
Dit brengt je totale boete op:
${context.totalFine.toFormat()}.

Ga snel naar de SudoSOS website om je saldo op te hogen en je boete te betalen.
Zo voorkom je dat de boete meer wordt of je account geblokkeerd wordt.

Met vriendelijke groet,
SudoSOS`,
});

const userGotFinedEnglish = new MailContent<UserGotFinedOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>

<p>On ${context.referenceDate.toLocaleString('nl-NL')} you had a balance of <span style="color: red; font-weight: bold;">${context.balance.toFormat()}</span>.<br>
For your debt, you have been fined for an amount of ${context.fine.toFormat()}.<br>
This brings your total fine to:<br>
<span style="color: red; font-weight: bold; font-size: 20px;">${context.totalFine.toFormat()}</span>.</p>

<p>Go to the SudoSOS website to deposit money into your account and pay your fines. With this you prevent getting more fines and getting your account blocked.</p>

${signatureEnglish}`,
  getSubject: (context) => `You have been fined ${context.fine.toFormat()} for your negative SudoSOS balance!`,
  getText: (context) => `
Dear ${context.name},

On ${context.referenceDate.toLocaleString('nl-NL')} you had a balance of ${context.balance.toFormat()}.
For your debt, you have been fined for an amount of ${context.fine.toFormat()}.
This brings your total fine to:
${context.totalFine.toFormat()}.

Go to the SudoSOS website to deposit money into your account and pay your fines.
With this you prevent getting more fines and getting your account blocked.

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<UserGotFinedOptions> = {
  [Language.DUTCH]: userGotFinedDutch,
  [Language.ENGLISH]: userGotFinedEnglish,
};

export default class UserGotFined extends MailTemplate<UserGotFinedOptions> {
  public constructor(options: UserGotFinedOptions) {
    super(options, mailContents);
  }
}
