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
import MailContent from './mail-content';
import { signatureDutch, signatureEnglish } from './signature';
import MailTemplate, { Language, MailLanguageMap } from './mail-template';

interface AdministrativeCostFinedOptions {
  name: string;
  url: string;
}

const administrativeCostFinedDutch = new MailContent<AdministrativeCostFinedOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Volgens onze administratie heb je nu 3 jaar lang al geen nieuwe transactie gemaakt via SudoSOS. Aangezien dit voor ons
kosten meebrengt hebben we hiervoor kosten verrekent. Dit is een bedrag van 10 euro.<br>
<br>


${signatureDutch}`,
  getSubject: () => 'SudoSOS administratieve kosten',
  getText: (context) => `
Beste ${context.name},

Volgens onze administratie heb je nu 3 jaar lang al geen nieuwe transactie gemaakt via SudoSOS. Aangezien dit voor ons
kosten meebrengt hebben we hiervoor kosten verrekent. Dit is een bedrag van 10 euro.


Met vriendelijke groet,
SudoSOS`,
});

const administrativeCostFinedEnglish = new MailContent<AdministrativeCostFinedOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>
<p>According to our administration you have not made a new transaction in the last 3 years via SudoSOS. As this brings administrative
costs to us, we have referred these costs to you . This is an amount of 10 euros.<br>
<br>



${signatureEnglish}`,
  getSubject: () => 'SudoSOS administrative costs',
  getText: (context) => `
Dear ${context.name},

According to our administration you have not made a new transaction in the last 3 years via SudoSOS. As this brings administrative
costs to us, we have referred these costs to you . This is an amount of 10 euros.

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<AdministrativeCostFinedOptions> = {
  [Language.DUTCH]: administrativeCostFinedDutch,
  [Language.ENGLISH]: administrativeCostFinedEnglish,
};

export default class AdministrativeCostNotification extends MailTemplate<AdministrativeCostFinedOptions> {
  public constructor(options: AdministrativeCostFinedOptions) {
    const opt: AdministrativeCostFinedOptions = { ...options };
    if (!options.url) {
      opt.url = process.env['URL '];
    }
    super(opt, mailContents);
  }
}