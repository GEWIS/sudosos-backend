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

import { Dinero } from 'dinero.js';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';

interface UserWillGetFinedOptions {
  referenceDate: Date;
  fine: Dinero;
  balance: Dinero;
}

const formatBalance = (b: Dinero) => {
  if (b.isPositive()) {
    return `<span style="font-weight: bold;">${b.toFormat()}</span>`;
  } else {
    return `<span style="color: red; font-weight: bold;">${b.toFormat()}</span>`;
  }
};

const getDateNL = (d: Date) => {
  const diff = Math.abs(new Date().getTime() - d.getTime());
  // Last 15 minutes
  if (diff < 15 * 60 * 1000) {
    return 'Op het moment van schrijven heb';
  }
  return `Op ${d.toLocaleString('nl-NL')} had`;
};

const getDateEN = (d: Date) => {
  const diff = Math.abs(new Date().getTime() - d.getTime());
  // Last 15 minutes
  if (diff < 15 * 60 * 1000) {
    return 'Currently, you have';
  }
  return `On ${d.toLocaleString('en-US')} you had`;
};

const userGotFinedDutch = new MailContentBuilder<UserWillGetFinedOptions>({
  getHTML: (context) => `
<p>${getDateNL(context.referenceDate)} je een saldo van ${formatBalance(context.balance)}.<br>
Vandaag heeft de BAC boetes uitgedeeld. De volgende keer dat er boetes worden uitgedeeld (waarschijnlijk volgende week), krijg jij een boute van ${context.fine.toFormat()}!<br>

<p>Ga snel naar de SudoSOS website om je saldo op te hogen en deze boete te voorkomen.</p>`,
  getSubject: () => 'De volgende keer krijg je een boete voor je negatieve SudoSOS saldo',
  getTitle: 'Schuldnotificatie',
  getText: (context) => `
${getDateNL(context.referenceDate)} je een saldo van ${context.balance.toFormat()}.
Vandaag heeft de BAC boetes uitgedeeld. De volgende keer dat er boetes worden uitgedeeld (waarschijnlijk volgende week), krijg jij een boute van ${context.fine.toFormat()}!

Ga snel naar de SudoSOS website om je saldo op te hogen en deze boete te voorkomen.`,
});

const userGotFinedEnglish = new MailContentBuilder<UserWillGetFinedOptions>({
  getHTML: (context) => `
<p>${getDateEN(context.referenceDate)} a balance of ${formatBalance(context.balance)}.<br>
Today, the BAC has handed out fines. Next time fines will be handed out (probably next week), you will get a fine of ${context.fine.toFormat()}!<br>

<p>Go to the SudoSOS website to deposit money into your account to prevent this fine.</p>`,
  getSubject: () => 'Next time you will get fined for your negative SudoSOS balance',
  getTitle: 'Debt notification',
  getText: (context) => `
${getDateEN(context.referenceDate)} a balance of ${context.balance.toFormat()}.
Today, the BAC has handed out fines. Next time fines will be handed out (probably next week), you will get a fine of ${context.fine.toFormat()}!

Go to the SudoSOS website to deposit money into your account to prevent this fine.`,
});

const mailContents: MailLanguageMap<UserWillGetFinedOptions> = {
  [Language.DUTCH]: userGotFinedDutch,
  [Language.ENGLISH]: userGotFinedEnglish,
};

export default class UserWillGetFined extends MailMessage<UserWillGetFinedOptions> {
  public constructor(options: UserWillGetFinedOptions) {
    super(options, mailContents);
  }
}
