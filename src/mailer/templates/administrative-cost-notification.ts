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

interface AdministrativeCostNotificationOptions {
  name: string;
  url: string;
}

const administrativeCostNotificationDutch = new MailContent<AdministrativeCostNotificationOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Volgens onze administratie heb je nu 2 jaar al geen nieuwe transactie gemaakt via SudoSOS. Aangezien dit voor ons
kosten meebrengt zullen we volgend jaar hier ook kosten voor rekenen. Dit zal een bedrag van 10 euro zijn.<br>
<br>
Mocht je niet willen dat deze kosten worden verrekent bij jou, kom dan nog een keer langs GEWIS om een transactie te maken 
of stuur een mail naar <a href="mailto: bacpm@gewis.nl">bacpm@gewis.nl</a> om je account te stoppen.


${signatureDutch}`,
  getSubject: () => 'SudoSOS administratieve kosten',
  getText: (context) => `
Beste ${context.name},

Volgens onze administratie heb je nu 2 jaar al geen nieuwe transactie gemaakt via SudoSOS. Aangezien dit voor ons
kosten meebrengt zullen we volgend jaar hier ook kosten voor rekenen. Dit zal een bedrag van 10 euro zijn.

Mocht je niet willen dat deze kosten worden verrekent bij jou, kom dan nog een keer langs GEWIS om een transactie te maken 
of stuur een mail naar bacpm@gewis.nl om je account te stoppen.

Met vriendelijke groet,
SudoSOS`,
});

const administrativeCostNotificationEnglish = new MailContent<AdministrativeCostNotificationOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>
<p>According to our administration you have not made a new transaction in the last 2 years via SudoSOS. As this brings administrative
costs to us, we will refer these costs to you next year. This would be an amount of 10 euros.<br>
<br>
If you do not want us to refer the costs to you, you can always come by GEWIS 1 more time to make a new transaction or send a mail to
 <a href="mailto: bacpm@gewis.nl">bacpm@gewis.nl</a> to delete your account.


${signatureEnglish}`,
  getSubject: () => 'SudoSOS administrative costs',
  getText: (context) => `
Dear ${context.name},

According to our administration you have not made a new transaction in the last 2 years via SudoSOS. As this brings administrative
costs to us, we will refer these costs to you next year. This would be an amount of 10 euros.

If you do not want us to refer the costs to you, you can always come by GEWIS 1 more time to make a new transaction or send a mail to
bacpm@gewis.nl to delete your account.

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<AdministrativeCostNotificationOptions> = {
  [Language.DUTCH]: administrativeCostNotificationDutch,
  [Language.ENGLISH]: administrativeCostNotificationEnglish,
};

export default class AdministrativeCostNotification extends MailTemplate<AdministrativeCostNotificationOptions> {
  public constructor(options: AdministrativeCostNotificationOptions) {
    const opt: AdministrativeCostNotificationOptions = { ...options };
    if (!options.url) {
      opt.url = process.env['URL '];
    }
    super(opt, mailContents);
  }
}