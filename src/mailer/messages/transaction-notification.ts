/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import { TransactionResponse } from '../../controller/response/transaction-response';
import Dinero from 'dinero.js';
import MailContentBuilder from './mail-content-builder';
import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import { DineroObjectResponse } from '../../controller/response/dinero-response';
import { TransactionNotificationOptions } from '../../notifications/notification-options';

/**
 * This is the module page of the transaction notification.
 *
 * @module internal/mailer
 */

// We make it a type to use Dinero itself for declarations
type DineroObject = Dinero.Dinero;

const formatAmount = (dineroResponse: DineroObjectResponse): string => {
  const dineroObject = Dinero({
    amount: dineroResponse.amount,
    currency: dineroResponse.currency,
    precision: dineroResponse.precision,
  });
  return dineroObject.toFormat();
};

const tableBuilder = (transaction: TransactionResponse): string => {
  let htmlString = "<table style='width:100%;'> " +
        "<tr><th style='width:20%;'>Quantity</th><th style='width:60%;'>Product</th><th style='width:20%;'>Total Price</th></tr>";

  const subTransactionRows = transaction.subTransactions.flatMap(s => s.subTransactionRows);

  for (const subRow of subTransactionRows) {
    const name = subRow.product.name;

    const formattedProductPrice = formatAmount(subRow.product.priceInclVat);
    const formattedTotalPrice = formatAmount(subRow.totalPriceInclVat);

    const quantity = subRow.amount;

    htmlString += `
        <tr><td>${quantity}</td>
        <td>${name} for ${formattedProductPrice} each</td>
        <td>${formattedTotalPrice}</td></tr>`;
  }

  htmlString += '</table>';
  return htmlString;
};

export const purchaseType = (
  t: TransactionResponse,
  lang: 'en' | 'nl',
): string => {
  const self = t.from.id === t.createdBy.id;

  if (lang === 'nl') {
    return self
      ? 'je hebt deze aankoop zelf gedaan.'
      : 'iemand anders heeft deze aankoop namens jou gedaan.';
  }

  return self
    ? 'you made this purchase.'
    : 'someone else made this purchase on your behalf.';
};

const balanceOrDebtDutch = (balance: DineroObject) =>
  balance.getAmount() < 0 ? 'schuld' : 'saldo';
const balanceOrDebtEnglish = (balance: DineroObject) =>
  balance.getAmount() < 0 ? 'debt' : 'balance';

const debtTextDutch = (balance: DineroObject) => {
  return balance.getAmount() < 0
    ? 'Let op: bij een negatief saldo worden er elke donderdag na de borrel extra kosten in rekening gebracht.'
    : '';
};

const debtTextEnglish = (balance: DineroObject) => {
  return balance.getAmount() < 0 ?
    'Please note that late fees are charged each Thursday after the social drink.' 
    : '';
};

const transactionNotificationDutch = new MailContentBuilder<TransactionNotificationOptions>({
  getHTML: (context) => `
      <p>Hierbij informeren we je dat ${purchaseType(context.transaction, 'nl')} Hieronder vind je de details: </p> 
      ${tableBuilder(context.transaction)} 
      <p>Het totaal bedraagt <strong>${formatAmount(context.transaction.totalPriceInclVat)}</strong>, 
      wat je met een totaal ${balanceOrDebtDutch(context.balance)} van ${context.balance.toFormat()} achterlaat.</p> 
      <p>${debtTextDutch(context.balance)}
       Je kunt je saldo op elk moment verhogen via de SudoSOS website.</p>
       <p>Als je vragen hebt over deze transactie, neem dan contact op via het e-mailadres in de footer van deze e-mail.</p> 
    `,
  getSubject: 'Jouw transactie bon',
  getTitle: 'Transactie bon',
  getText: (context) =>
    `
      Hierbij informeren we je dat ${purchaseType(context.transaction, 'nl')} Hieronder vind je de details: 
       ${tableBuilder(context.transaction)} 
      Het totaal bedraagt ${formatAmount(context.transaction.totalPriceInclVat)}, 
      wat je met een totaal ${balanceOrDebtDutch(context.balance)} van ${context.balance.toFormat()} achterlaat.
      ${debtTextDutch(context.balance)}
       Je kunt je saldo op elk moment verhogen via de SudoSOS website.
       Als je vragen hebt over deze transactie, neem dan contact op via het e-mailadres in de footer van deze e-mail.
    `,
});

const transactionNotificationEnglish = new MailContentBuilder<TransactionNotificationOptions>({
  getHTML: (context) => `
          <p>We love to inform you that ${purchaseType(context.transaction, 'en')} Below are the details:</p>
        ${tableBuilder(context.transaction)}
    <p>We have debited your account for the total amount <strong>${formatAmount(context.transaction.totalPriceInclVat)}</strong> 
    which leaves you with a total ${balanceOrDebtEnglish(context.balance)} of ${context.balance.toFormat()}.</p>
    <p>${debtTextEnglish(context.balance)}
    You can increase your balance at any time on the SudoSOS website.</p>
    <p>If you have any questions about this transaction, please reach out to the email address in the footer of this email.
    `,
  getSubject: 'Your transaction receipt',
  getTitle: 'Your transaction receipt',
  getText: (context) =>
    `
    We love to inform you that ${purchaseType(context.transaction, 'en')} Below are the details:
    ${tableBuilder(context.transaction)}
    We have debited your account for the total amount ${formatAmount(context.transaction.totalPriceInclVat)}
    which leaves you with a total ${balanceOrDebtEnglish(context.balance)} of ${context.balance.toFormat()}.
    ${debtTextEnglish(context.balance)}
    You can increase your balance at any time on the SudoSOS website.
    If you have any questions about this transaction, please reach out to the email address in the footer of this email.
    `,
});

const mailContents: MailLanguageMap<TransactionNotificationOptions> = {
  [Language.DUTCH]: transactionNotificationDutch,
  [Language.ENGLISH]: transactionNotificationEnglish,
};

export default class TransactionNotification extends MailMessage<TransactionNotificationOptions> {
  public constructor(options: TransactionNotificationOptions) {
    super(options, mailContents);
  }
}
