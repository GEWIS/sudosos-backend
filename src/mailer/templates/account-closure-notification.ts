import { Dinero } from 'dinero.js';
import MailContent from './mail-content';
import { signatureDutch, signatureEnglish } from './signature';
import MailTemplate, { Language, MailLanguageMap } from './mail-template';

interface AccountClosureNotificationOptions {
  name: string;
  balance: Dinero;
}

const accountClosureNotificationDutch = new MailContent<AccountClosureNotificationOptions>({
  getHTML: (context) => `
<p>Beste ${context.name},</p>

<p>Wij willen u informeren dat uw account bij SudoSOS is gesloten. Op het moment van sluiting was het saldo van uw account:<br>
<span style="color: red; font-weight: bold; font-size: 20px">${context.balance.toFormat()}</span>.</p>

<p>Mocht u vragen hebben, kunt u contact opnemen met de penningmeester van de Bar Committee via <a href="mailto:bacpm@gewis.nl">bacpm@gewis.nl</a>.</p>

${signatureDutch}`,
  getSubject: () => 'Uw SudoSOS-account is gesloten',
  getText: (context) => `
Beste ${context.name},

Wij willen u informeren dat uw account bij SudoSOS is gesloten. Op het moment van sluiting was het saldo van uw account:
${context.balance.toFormat()}

Mocht u vragen hebben, kunt u contact opnemen met de penningmeester van de Bar Committee via bacpm@gewis.nl.

Met vriendelijke groet,
SudoSOS`,
});

const accountClosureNotificationEnglish = new MailContent<AccountClosureNotificationOptions>({
  getHTML: (context) => `
<p>Dear ${context.name},</p>

<p>We would like to inform you that your account at SudoSOS has been closed. At the time of closure, your account balance was:<br>
<span style="color: red; font-weight: bold">${context.balance.toFormat()}</span>.</p>

<p>If you have any questions, please contact the Treasurer of the Bar Committee via <a href="mailto:bacpm@gewis.nl">bacpm@gewis.nl</a>.</p>

${signatureEnglish}`,
  getSubject: () => 'Your SudoSOS Account Has Been Closed',
  getText: (context) => `
Dear ${context.name},

We would like to inform you that your account at SudoSOS has been closed. At the time of closure, your account balance was:
${context.balance.toFormat()}

If you have any questions, please contact the Treasurer of the Bar Committee via bacpm@gewis.nl.

Kind regards,
SudoSOS`,
});

const mailContents: MailLanguageMap<AccountClosureNotificationOptions> = {
  [Language.DUTCH]: accountClosureNotificationDutch,
  [Language.ENGLISH]: accountClosureNotificationEnglish,
};

export default class AccountClosureNotification extends MailTemplate<AccountClosureNotificationOptions> {
  public constructor(options: AccountClosureNotificationOptions) {
    const opt: AccountClosureNotificationOptions = { ...options };
    super(opt, mailContents);
  }
}
