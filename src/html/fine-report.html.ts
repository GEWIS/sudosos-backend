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

export interface IFineReportPdf {
  fromDate: string;
  toDate: string;
  count: number;
  handedOut: string;
  waivedCount: number;
  waivedAmount: string;
  totalExclVat: string;
  vatAmount: string;
  vatPercentage: number;
  totalInclVat: string;
  serviceEmail: string;
}

export function createFineReportPdf(options: IFineReportPdf): string {
  const meta = `
    <div class="card">
      <h3>Report Period</h3>
      <p>From ${options.fromDate} till ${options.toDate}</p>
    </div>
    <div class="card">
      <h3>Total</h3>
      <p>${options.totalInclVat}</p>
      <div class="small">Total fines handed out minus waived, incl. VAT</div>
    </div>
  `;

  const waivedRow = options.waivedCount > 0
    ? `
        <tr>
          <td>Waived</td>
          <td class="qty">${options.waivedCount}</td>
          <td class="total">-${options.waivedAmount}</td>
        </tr>`
    : '';

  const details = `
    <div style="margin-bottom: 1.5em; padding: 1em; background: #F9F9F9; border-left: 4px solid var(--primary); border-radius: 4px;">
      <h3 style="margin: 0 0 0.5em 0; font-size: 16px; color: var(--ink);">Fine Report</h3>
      <p style="margin: 0; font-size: 13px; line-height: 1.6; color: var(--muted);">
        This report summarises the fines handed out and waived during the reporting period.
        It is used by the treasurer for reconciliation.
        VAT is recorded on the last day of the period.
      </p>
    </div>

    <table class="items" role="table">
      <thead>
        <tr>
          <td>Description</td>
          <td class="qty">Count</td>
          <td class="total">Amount</td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Handed out</td>
          <td class="qty">${options.count}</td>
          <td class="total">${options.handedOut}</td>
        </tr>${waivedRow}
      </tbody>
    </table>

    <div class="summary" style="margin-top:1em; text-align:right;">
      <table style="margin-left:auto;text-align:right">
        <tr>
          <td>Subtotal excl.</td>
          <td>${options.totalExclVat}</td>
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
          <tr>
            <td style="padding: 0.5em 1em;">${options.vatPercentage}%</td>
            <td style="padding: 0.5em 1em;">${options.totalExclVat}</td>
            <td style="padding: 0.5em 1em;">${options.vatAmount}</td>
          </tr>
        </tbody>
      </table>

      <table style="margin-left:auto;text-align:right;margin-top:0.5em;font-weight:bold">
        <tr>
          <td>Total incl.</td>
          <td>${options.totalInclVat}</td>
        </tr>
      </table>
    </div>
  `;

  return createBasePdf({
    pageTitle: 'Fine Report PDF',
    headerTitle: 'Fine Report',
    headerRightTitle: 'Report Period',
    headerRightSub: `${options.fromDate} - ${options.toDate}`,
    meta,
    details,
    serviceEmail: options.serviceEmail,
  });
}
