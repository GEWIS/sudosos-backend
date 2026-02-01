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

import { createBasePdf } from './base.html';

export interface ITransferPdf {
  transferId: string;
  fromUserFirstName: string;
  fromUserLastName: string;
  fromAccount: string;
  toUserFirstName: string;
  toUserLastName: string;
  toAccount: string;
  date: string;
  description: string;
  amount: string;
  serviceEmail: string;
}

export function createTransferPdf(options: ITransferPdf): string {
  const meta = `
    <div class="card">
      <h3>From</h3>
      <p>${options.fromUserFirstName} ${options.fromUserLastName}</p>
      <div class="small">Account: ${options.fromAccount}</div>
    </div>
    <div class="card">
      <h3>To</h3>
      <p>${options.toUserFirstName} ${options.toUserLastName}</p>
      <div class="small">Account: ${options.toAccount}</div>
    </div>
    <div class="card">
      <h3>Date</h3>
      <p>${options.date}</p>
    </div>
  `;

  const details = `
    <div style="margin-bottom: 1.5em; padding: 1em; background: #F9F9F9; border-left: 4px solid var(--primary); border-radius: 4px;">
      <h3 style="margin: 0 0 0.5em 0; font-size: 16px; color: var(--ink);">Balance Transfer</h3>
      <p style="margin: 0; font-size: 13px; line-height: 1.6; color: var(--muted);">
        This document records a balance movement within SudoSOS, showing the transferred amount and the originating and/or receiving account.
        Balances in SudoSOS qualify as Multi Purpose Vouchers (MPV) under
        <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016L1065" target="_blank" rel="noopener noreferrer">
          Directive (EU) 2016/1065
        </a>.
        No VAT is due on balance top-ups, payouts, or transfers between accounts.
        VAT only becomes applicable when a balance is used to purchase goods or services.
      </p>
    </div>

    <table class="items" role="table">
      <thead>
        <tr>
          <td>Description</td>
          <td class="total">Amount</td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${options.description}</td>
          <td class="total">${options.amount}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr>
          <td class="label grand">Total</td>
          <td class="amt grand">${options.amount}</td>
        </tr>
      </table>
    </div>
  `;

  return createBasePdf({
    pageTitle: 'Transfer PDF',
    headerTitle: 'Transfer Info',
    headerRightTitle: 'Transfer ID',
    headerRightSub: options.transferId,
    meta,
    details,
    serviceEmail: options.serviceEmail,
  });
}
