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
import { createBasePdf } from './base.html';

export interface ITransactionItem {
  description: string;
  qty: number;
  unit: string;
  unitPriceExclVat: number; // euro value
  vatRate: number;          // e.g. 9 or 21
}

export interface ITransactionPdf {
  transactionId: string;
  fromUserFirstName: string;
  fromUserLastName: string;
  fromId: string;
  createdByUserFirstName: string;
  createdByUserLastName: string;
  date: string;
  items: ITransactionItem[];
  serviceEmail: string;
}

function roundCents(n: number) {
  return Math.round(n * 100) / 100;
}

const nlCurrencyFormatter = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrencyNl(n: number) {
  return nlCurrencyFormatter.format(n).replace(/\u00A0/g, '');
}

export function createTransactionPdf(options: ITransactionPdf): string {
  const vatGroups = new Map<number, { base: number; vat: number }>();
  let subtotalExcl = 0;
  let totalVat = 0;

  const itemsHtml = options.items.map(item => {
    const qty = item.qty;
    const baseTotal = roundCents(item.unitPriceExclVat * qty);
    const vatTotal = roundCents(baseTotal * item.vatRate / 100);

    subtotalExcl = roundCents(subtotalExcl + baseTotal);
    totalVat = roundCents(totalVat + vatTotal);

    const group = vatGroups.get(item.vatRate) ?? { base: 0, vat: 0 };
    group.base = roundCents(group.base + baseTotal);
    group.vat = roundCents(group.vat + vatTotal);
    vatGroups.set(item.vatRate, group);

    const lineTotalIncl = roundCents(baseTotal + vatTotal);

    return `
      <tr>
        <td>${item.description}</td>
        <td class="qty">${qty}</td>
        <td class="price">${formatCurrencyNl(item.unitPriceExclVat)}</td>
        <td>${item.vatRate}%</td>
        <td class="total">${formatCurrencyNl(lineTotalIncl)}</td>
      </tr>
    `;
  }).join('');

  const totalIncl = roundCents(subtotalExcl + totalVat);

  const meta = `
    <div class="card">
      <h3>From</h3>
      <p>${options.fromUserFirstName} ${options.fromUserLastName}</p>
      <div class="small">User ID: ${options.fromId}</div>
    </div>
    <div class="card">
      <h3>Created by</h3>
      <p>${options.createdByUserFirstName} ${options.createdByUserLastName}</p>
      <div class="small">Date: ${options.date}</div>
    </div>
  `;

  const details = `
  <table class="items">
    <thead>
      <tr>
        <td>Description</td>
        <td class="qty">Qty</td>
        <td>Unit price</td>
        <td>VAT</td>
        <td>Total</td>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="summary" style="margin-top:1em; text-align:right;">
    <table style="margin-left:auto;text-align:right">
      <tr>
        <td>Subtotal excl.</td>
        <td>${formatCurrencyNl(subtotalExcl)}</td>
      </tr>
    </table>

    <table style="margin-left:auto;text-align:right;margin-top:1.5em;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="padding:0.5em 1em;">VAT</th>
          <th style="padding:0.5em 1em;">Over</th>
          <th style="padding:0.5em 1em;">EUR</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from(vatGroups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, { base, vat }]) => `
            <tr>
              <td style="padding: 0.5em 1em;">${rate}%</td>
              <td style="padding: 0.5em 1em;">${formatCurrencyNl(base)}</td>
              <td style="padding: 0.5em 1em;">${formatCurrencyNl(vat)}</td>
            </tr>
          `).join('')}
        <tr>
          <td style="padding: 0.5em 1em;">Total</td>
          <td style="padding: 0.5em 1em;"></td>
          <td style="padding: 0.5em 1em;">${formatCurrencyNl(totalVat)}</td>
        </tr>
      </tbody>
    </table>

    <table style="margin-left:auto;text-align:right;margin-top:0.5em;font-weight:bold">
      <tr>
        <td>Total incl.</td>
        <td>${formatCurrencyNl(totalIncl)}</td>
      </tr>
    </table>
  </div>
`;

  return createBasePdf({
    pageTitle: 'Transaction PDF',
    headerTitle: 'Transaction Info',
    headerRightTitle: 'Transaction ID',
    headerRightSub: options.transactionId,
    meta,
    details,
    serviceEmail: options.serviceEmail,
  });
}

