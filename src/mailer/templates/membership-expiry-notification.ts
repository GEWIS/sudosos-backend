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

interface MembershipExpiryNotificationOptions {
  name: string;
  balance: Dinero;
}

const formatBalance = (balance: Dinero) => {
  const isNegative = balance.getAmount() < 0;
  return `<span style="color: ${isNegative ? 'red' : 'black'}; font-weight: bold; font-size: 20px">${balance.toFormat()}</span>`;
};

const membershipExpiryNotificationDutch = new MailContent<MembershipExpiryNotificationOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Wij willen u informeren dat uw account bij SudoSOS is gedeactiveerd omdat uw lidmaatschap bij de GEWIS is verlopen. Op het moment van sluiting was het saldo van uw account:<br>
${formatBalance(context.balance)}</p>

<p>Om uw lidmaatschap, en toegang tot SudoSOS, te verlengen, klikt u op de link in uw e-mail inbox (deze is 31 dagen geldig na het verlopen van het lidmaatschap).</p>

<p>Als u geen lid meer wilt blijven van GEWIS, maar nog steeds gebruik wilt maken van SudoSOS, kunt u een lokaal account aanvragen. Neem hiervoor contact op met de penningmeester van de Bar Commissie via <a href="mailto:bacpm@gewis.nl">bacpm@gewis.nl</a>.</p>

${signatureDutch}`,
  getSubject: () => 'Uw SudoSOS-account is gedeactiveerd',
  getText: (context) => `
Beste ${context.name},

Wij willen u informeren dat uw account bij SudoSOS is gedeactiveerd omdat uw lidmaatschap bij GEWIS is verlopen. Op het moment van sluiting was het saldo van uw account:
${context.balance.toFormat()}

Om uw lidmaatschap te verlengen, en toegang tot SudoSOS, klikt u op de link in uw e-mail inbox (deze is 31 dagen geldig na het verlopen van het lidmaatschap).

Als u geen lid meer wilt blijven van GEWIS, maar nog steeds gebruik wilt maken van SudoSOS, kunt u een lokaal account aanvragen. Neem hiervoor contact op met de penningmeester van de Bar Committee via bacpm@gewis.nl.

Met vriendelijke groet,
SudoSOS`,
});

const membershipExpiryNotificationEnglish = new MailContent<MembershipExpiryNotificationOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>

<p>We would like to inform you that your account at SudoSOS has been deactivated because your membership at GEWIS has expired. At the time of deactivation, your account balance was:<br>
${formatBalance(context.balance)}</p>

<p>To extend your membership, and your access to SudoSOS, please click the link in your email inbox (valid for 31 days after membership expiration).</p>

<p>If you no longer wish to remain a member of GEWIS but still want to use SudoSOS, you can request a local account. Please contact the Treasurer of the Bar Committee via <a href="mailto:bacpm@gewis.nl">bacpm@gewis.nl</a> for more information.</p>

${signatureEnglish}`,
  getSubject: () => 'Your SudoSOS Account Has Been Deactivated',
  getText: (context) => `
Dear ${context.name},

We would like to inform you that your account at SudoSOS has been deactivated because your membership at GEWIS has expired. At the time of deactivation, your account balance was:
${context.balance.toFormat()}

To extend your membership, and your access to SudoSOS,  please click the link in your email inbox (valid for 31 days after membership expiration).

If you no longer wish to remain a member of GEWIS but still want to use SudoSOS, you can request a local account. Please contact the Treasurer of the Bar Committee via bacpm@gewis.nl for more information.

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<MembershipExpiryNotificationOptions> = {
  [Language.DUTCH]: membershipExpiryNotificationDutch,
  [Language.ENGLISH]: membershipExpiryNotificationEnglish,
};

export default class MembershipExpiryNotification extends MailTemplate<MembershipExpiryNotificationOptions> {
  public constructor(options: MembershipExpiryNotificationOptions) {
    const opt: MembershipExpiryNotificationOptions = { ...options };
    super(opt, mailContents);
  }
}
