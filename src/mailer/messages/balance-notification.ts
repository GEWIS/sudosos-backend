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

import MailContentBuilder from "./mail-content-builder";
import { Dinero } from 'dinero.js';
import MailMessage, {Language, MailLanguageMap} from "../mail-message";

interface BalanceNotificationOption {
    balance: Dinero;
}

const balanceNotificationDutch = new MailContentBuilder<BalanceNotificationOption>({
    getHTML: (context) => `
    <p>  Je hebt opgegeven om na elke week een saldo update te krijgen. <br/><br/>
        Je saldo na deze week is:<br>
<span style="color: red; font-weight: bold; font-size: 20px">${context.balance.toFormat()}</span>.</p>
        `,
    getSubject: 'Jouw balans',
    getTitle:'Balans notificatie',
    getText: (context) => `
    Je hebt opgegeven om na elke week een saldo update te krijgen.

    Je saldo na deze week is:
    ${context.balance.toFormat()}.
    `
});

const balanceNotificationEnglish = new MailContentBuilder<BalanceNotificationOption>({
    getHTML: (context) => `
    <p> You have opted to receive a balance update after each week. <br/><br/> 
    Your balance after this week is:<br> 
    <span style="color: red; font-weight: bold; font-size: 20px">${context.balance.toFormat()}</span>.</p>
        `,
    getSubject: 'Your balance',
    getTitle:'Balance notification',
    getText: (context) => `
    You have opted to receive a balance update after each week.
    Your balance after this week is:
    ${context.balance.toFormat()}.
    `
});

const mailContents: MailLanguageMap<BalanceNotificationOption> = {
    [Language.DUTCH]: balanceNotificationDutch,
    [Language.ENGLISH]: balanceNotificationEnglish,
};

export default class BalanceNotification extends MailMessage<BalanceNotificationOption> {
    public constructor(options: BalanceNotificationOption) {
        super(options, mailContents);
    }
}