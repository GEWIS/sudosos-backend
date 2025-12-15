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
