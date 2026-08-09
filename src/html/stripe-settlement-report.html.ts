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

export interface IStripeSettlementReportPdf {
  fromDate: string;
  toDate: string;
  depositCount: number;
  depositTotalAmount: string;
  terminalPaymentCount: number;
  terminalPaymentTotalAmount: string;
  totalCount: number;
  totalAmount: string;
  serviceEmail: string;
}

export function createStripeSettlementReportPdf(options: IStripeSettlementReportPdf): string {
  const meta = `
    <div class="card">
      <h3>Report Period</h3>
      <p>From ${options.fromDate} till ${options.toDate}</p>
    </div>
    <div class="card">
      <h3>Total</h3>
      <p>${options.totalAmount}</p>
      <div class="small">Total gross amount settled through Stripe</div>
    </div>
  `;

  const details = `
    <div style="margin-bottom: 1.5em; padding: 1em; background: #F9F9F9; border-left: 4px solid var(--primary); border-radius: 4px;">
      <h3 style="margin: 0 0 0.5em 0; font-size: 16px; color: var(--ink);">Stripe Settlement Report</h3>
      <p style="margin: 0; font-size: 13px; line-height: 1.6; color: var(--muted);">
        This report summarises everything that settled through Stripe during
        the reporting period (from the start date up to, but not including,
        the end date): online top-ups and terminal payments. It is used by the
        treasurer to cross-reference against Stripe's payouts. Totals are
        gross amounts charged to customers' cards, not net of Stripe's
        processing fees, and exclude payments settled via a shareable payment
        link.
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
          <td>Online top-ups</td>
          <td class="qty">${options.depositCount}</td>
          <td class="total">${options.depositTotalAmount}</td>
        </tr>
        <tr>
          <td>Terminal payments</td>
          <td class="qty">${options.terminalPaymentCount}</td>
          <td class="total">${options.terminalPaymentTotalAmount}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary" style="margin-top:1em; text-align:right;">
      <table style="margin-left:auto;text-align:right;margin-top:0.5em;font-weight:bold">
        <tr>
          <td>Total (gross)</td>
          <td>${options.totalAmount}</td>
        </tr>
      </table>
    </div>
  `;

  return createBasePdf({
    pageTitle: 'Stripe Settlement Report PDF',
    headerTitle: 'Stripe Settlement Report',
    headerRightTitle: 'Report Period',
    headerRightSub: `${options.fromDate} - ${options.toDate}`,
    meta,
    details,
    serviceEmail: options.serviceEmail,
  });
}
