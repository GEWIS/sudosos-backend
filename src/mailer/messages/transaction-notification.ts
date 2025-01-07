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

import {SubTransactionResponse, TransactionResponse} from "../../controller/response/transaction-response";
import {Dinero} from "dinero.js";
import MailContentBuilder from "./mail-content-builder";
import html = Mocha.reporters.html;
import MailMessage, {Language, MailLanguageMap} from "../mail-message";

/**
 * This is the module page of the user-debt-notification.
 *
 * @module internal/mailer
 */

interface TransactionNotificationOptions {
    transactionResponse: TransactionResponse;
    balance: Dinero;
}

const tableBuilder = (transactionData: TransactionResponse) => {
    let htmlString = "<table style='width:100%;'> " +
        "<tr><th style='width:20%;'>Quantity</th><th style='width:60%;'>Product</th><th style='width:20%;'>Price</th></tr>"

    const subTransactionRows = transactionData.subTransactions.flatMap(s => s.subTransactionRows);

    for (const subRow of subTransactionRows) {
        const name = subRow.product.name;
        const productPrice = subRow.product.priceInclVat.amount;
        const totalPrice = subRow.totalPriceInclVat.amount;
        const quantity = subRow.amount;

        const tableRow = "<tr><td>" + quantity + "</td><td>" + name + " " + productPrice + "</td><td>" + totalPrice + "</td></tr>";

        htmlString += tableRow;
    }

    htmlString += "</table>";

    return htmlString;
}

const purchaseType = (transactionData: TransactionResponse) => {
    if (transactionData.from == transactionData.createdBy) {
        return "you just made a purchase";
    } else {
        return "a purchase was entered on behalf";
    }
}

const balanceOrDebtDutch = (balance: Dinero) => {return balance.getAmount() < 0 ? "debt" : "balance";}
const balanceOrDebtEnglish = (balance: Dinero) => {return balance.getAmount() < 0 ? "debt" : "balance";}

const debtTextDutch = (balance: Dinero) => {return balance.getAmount() < 0 ? "Please note that late fees are charged each Thursday after the social drink." : "";}
const debtTextEnglish = (balance: Dinero) => {return balance.getAmount() < 0 ? "Please note that late fees are charged each Thursday after the social drink." : "";}

const transactionNotificationDutch = new MailContentBuilder<TransactionNotificationOptions>({
    getHTML: (context) => `
     <p>Beste ${context.transactionResponse.from.firstName},<br/><br/>
      Hierbij informeren we je dat ${purchaseType(context.transactionResponse)} in SudoSOS. Hieronder vind je de details: 
      </p> ${tableBuilder(context.transactionResponse)} 
      <p>Het totaal bedraagt <strong>€${context.transactionResponse.totalPriceInclVat.amount}</strong>, 
      wat je met een totaal ${balanceOrDebtDutch(context.balance)} van ${context.balance.toFormat()} achterlaat.</p> 
      <p>${debtTextDutch(context.balance)}
       Je kunt je saldo op elk moment verhogen via de SudoSOS website.</p>
       <p>Als je vragen hebt over deze transactie, neem dan contact op via het e-mailadres in de footer van deze e-mail.</p> 
    `,
    getSubject: 'Jouw transactie bon',
    getTitle: 'Transactie bon' ,
    getText: (context) =>
    `
Beste ${context.transactionResponse.from.firstName},
      Hierbij informeren we je dat ${purchaseType(context.transactionResponse)} in SudoSOS. Hieronder vind je de details: 
       ${tableBuilder(context.transactionResponse)} 
      Het totaal bedraagt €${context.transactionResponse.totalPriceInclVat.amount}, 
      wat je met een totaal ${balanceOrDebtDutch(context.balance)} van ${context.balance.toFormat()} achterlaat.
      ${debtTextDutch(context.balance)}
       Je kunt je saldo op elk moment verhogen via de SudoSOS website.
       Als je vragen hebt over deze transactie, neem dan contact op via het e-mailadres in de footer van deze e-mail.
    `
});

const transactionNotificationEnglish = new MailContentBuilder<TransactionNotificationOptions>({
    getHTML: (context) => `
     <p>Dear ${context.transactionResponse.from.firstName},<br/><br/>
          We love to inform you that ${purchaseType(context.transactionResponse)} in SudoSOS. Below are the details:
        </p>
        ${tableBuilder(context.transactionResponse)}
    <p>We have debited your account for the total amount <strong>€${context.transactionResponse.totalPriceInclVat.amount}</strong> 
    which leaves you with a total ${balanceOrDebtEnglish(context.balance)} of ${context.balance.toFormat()}.</p>
    <p>${debtTextEnglish(context.balance)}
    You can increase your balance at any time on the SudoSOS website.</p>
    <p>If you have any questions about this transaction, please reach out to the email address in the footer of this email.
    `,
    getSubject: 'Jouw transactie bon',
    getTitle: 'Transactie bon' ,
    getText: (context) =>
        `
Dear ${context.transactionResponse.from.firstName},
We love to inform you that ${purchaseType(context.transactionResponse)} in SudoSOS. Below are the details:
${tableBuilder(context.transactionResponse)}
We have debited your account for the total amount €${context.transactionResponse.totalPriceInclVat.amount}
which leaves you with a total ${balanceOrDebtEnglish(context.balance)} of ${context.balance.toFormat()}.
${debtTextEnglish(context.balance)}
You can increase your balance at any time on the SudoSOS website.
If you have any questions about this transaction, please reach out to the email address in the footer of this email.
    `
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