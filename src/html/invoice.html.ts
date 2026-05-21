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

/**
 * HTML template for the Invoice PDF (the "F6c" design selected during the
 * cli/dev-invoice-variants exploration). Two pages: an AH-style cover with
 * the recipient, invoice metadata, total headline, BTW specification and
 * payment instructions; then a line-items page (one row per
 * sub_transaction_row, with a total).
 *
 * Compiled to a PDF by `pdf-compiler` via `BaseHtmlPdfService`.
 */

import fs from 'fs';
import path from 'path';
import { BAC } from '../files/templates/bac-letterhead';

const PRIMARY = '#004b31';
const PRIMARY_DARK = '#074a33';
const MUTED = '#6B6B6B';

// BAC logo, inlined as SVG so the rendered HTML doesn't need to fetch the
// asset at compile time. The SVG fills its parent container, so sizing is
// controlled by the wrapping `.logo` div.
const BAC_LOGO = fs.readFileSync(
  path.resolve(__dirname, '../../static/pdf/bac_logo.svg'),
  'utf-8',
)
  .replace(/<\?xml[^>]*\?>/g, '')
  .replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');

export interface IInvoiceAddress {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

/** One row in the cover-page BTW specification matrix (per-VAT-band totals). */
export interface IInvoiceVatBand {
  /** VAT percentage; 0 renders as "None" on the cover. */
  rate: number;
  /** Sum of the excl-VAT amount across rows in this band, in euros. */
  excl: number;
  /** Sum of the VAT amount across rows in this band, in euros. */
  vat: number;
  /** Sum of the incl-VAT amount across rows in this band, in euros. */
  incl: number;
}

/** One row in the line-items page (a single sub_transaction_row). */
export interface IInvoiceLineItem {
  /** sub_transaction_row.id, used to sort the line-items page. */
  id: number;
  description: string;
  qty: number;
  /** VAT percentage; 0 renders as "None". */
  rate: number;
  /** Per-row excl-VAT amount in euros. */
  excl: number;
  /** Per-row VAT amount in euros. */
  vat: number;
  /** Per-row incl-VAT amount in euros. */
  incl: number;
}

export interface IInvoicePdf {
  /** Human-facing invoice reference (e.g. BAC-0). */
  reference: string;
  /** Numeric identifier (Invoice.id), shown as "Sequence number". */
  identifier: string;
  /** ISO date string, displayed as the issue date. */
  date: string;
  /** ISO date string, displayed as the payment due date. */
  dueDate: string;
  /** The recipient User.id, shown as "Customer number". */
  customerNumber: string;
  /** Free-text invoice subject; rendered as a "Subject" section above the
   *  Total headline. May be empty. */
  subject: string;
  addressee: string;
  /** "For the attention of" recipient line. Rendered as "Attn. <name>" between
   *  the addressee and the street, omitted entirely when empty. */
  attention: string;
  address: IInvoiceAddress;
  /** Cover-page totals: 3-row matrix per VAT band. */
  vatBreakdown: IInvoiceVatBand[];
  /** Line-items page: one row per sub_transaction_row, sorted by id. */
  lineItems: IInvoiceLineItem[];
  totalIncl: number;
  subtotalExcl: number;
  totalVat: number;
}

const eur = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt = (n: number) => eur.format(n).replace(/ /g, '');

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the Invoice PDF HTML.
 *
 * Output is a complete `<html>` document, ready to POST to pdf-compiler's
 * `/compile-html` endpoint.
 */
export function createInvoicePdf(options: IInvoicePdf): string {
  const subject = (options.subject ?? '').trim();
  const subjectSection = subject.length === 0 ? '' : `
    <section style="margin-bottom:40px">
      <div style="font-size:9.5pt; color:${MUTED}; text-transform:uppercase; letter-spacing:1.2px; font-weight:600; margin-bottom:6px">Subject</div>
      <div style="font-size:13pt; font-weight:600">${escapeHtml(subject)}</div>
    </section>`;

  const attention = (options.attention ?? '').trim();
  const attentionLine = attention.length === 0
    ? ''
    : `Attn. ${escapeHtml(attention)}<br>`;

  const vatRows = options.vatBreakdown.map((b) => `
    <tr>
      <td class="desc">Orders</td>
      <td class="rate">${b.rate === 0 ? 'None' : `${b.rate}%`}</td>
      <td class="num">${fmt(b.excl)}</td>
      <td class="num">${fmt(b.vat)}</td>
      <td class="num">${fmt(b.incl)}</td>
    </tr>`).join('');

  const lineItemRows = options.lineItems.map((it) => `
    <tr>
      <td class="desc">${escapeHtml(it.description)}</td>
      <td class="qty">${it.qty}</td>
      <td class="rate">${it.rate === 0 ? 'None' : `${it.rate}%`}</td>
      <td class="num">${fmt(it.excl)}</td>
      <td class="num">${fmt(it.vat)}</td>
      <td class="num">${fmt(it.incl)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  html, body { margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font: 10.5pt/1.55 "Helvetica Neue", Arial, sans-serif; color:#222 }

  /* Each page is its own flex column so its footer can be pushed to the
     bottom of that page regardless of body content height. */
  .page { display:flex; flex-direction:column; min-height:100vh }
  .page + .page, .page + .items-flow { page-break-before:always; break-before:page }
  /* Items section uses a plain block so the table can overflow across pages
     without breaking @page rules; flex + min-height:100vh suppresses them. */
  .items-flow { break-before:page }

  .band { background:linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK}); color:white; padding:22px 56px; display:flex; align-items:center; gap:36px; flex:0 0 auto }
  .band .logo { width:72px; height:72px; flex:0 0 72px }
  .band .lockup .lbl { font-size:10pt; text-transform:uppercase; letter-spacing:1.6px; opacity:0.85 }
  .band .lockup .ref { font-size:18pt; font-weight:700; margin-top:2px; letter-spacing:-0.3px }

  .body { padding:48px 56px 0; flex:1 }

  .top { display:flex; justify-content:space-between; gap:48px; margin-bottom:72px }
  .recipient p { margin:0; line-height:1.4; font-size:10pt }
  .meta-list { font-size:10pt; line-height:1.5 }
  .meta-list .row { display:flex; gap:6px; justify-content:flex-end }
  .meta-list .lbl { color:${MUTED}; text-align:right; min-width:90px }
  .meta-list .v { min-width:140px; text-align:left }

  .total-headline { margin-bottom:96px }
  .total-headline .h { font-size:34pt; font-weight:700; line-height:1.08; letter-spacing:-0.6px }
  .total-headline .note { font-size:9pt; color:${MUTED}; margin-top:14px; max-width:560px; line-height:1.55 }

  .spec { width:100%; border-collapse:collapse; font-size:10pt; margin-bottom:14px }
  .spec thead th { font-weight:normal; color:${MUTED}; font-size:9.5pt; padding:4px 14px 10px 0; border-bottom:1px solid #BBB; text-align:left }
  .spec thead th.num { text-align:right; padding-right:0 }
  .spec tbody td { padding:7px 14px 7px 0; vertical-align:top }
  .spec td.num { text-align:right; padding-right:0; font-variant-numeric:tabular-nums }
  .spec td.rate { color:${MUTED} }
  .spec tr.total td { padding-top:14px; padding-bottom:6px; border-top:1px solid #333 }
  .spec tr.total td.muted { color:${MUTED}; font-weight:normal !important }
  .spec tr.total td.bold { font-weight:700 }

  .questions { font-size:9pt; color:${MUTED}; margin-top:24px; text-align:right }

  /* Footer column proportions: BAC name+address | VAT+KvK | IBAN | contact.
     All four columns lead with a header line; the BTW/IBAN columns use an
     invisible <strong> spacer so their data rows align with the address /
     email rows in the bold-labelled columns. */
  .page-foot { padding:24px 56px 30px; margin-top:60px; font-size:8.5pt; color:${MUTED}; line-height:1.5; display:grid; grid-template-columns:1.3fr 1.2fr 1.6fr 1.1fr; gap:24px; flex:0 0 auto }
  .page-foot .col { white-space:nowrap }
  .page-foot .col strong { display:block; color:#111; font-size:9pt; margin-bottom:4px; font-weight:700; white-space:normal }

  /* Line-items page (page 2): per-row items table. Compact rows so a typical
     ~30-row invoice fits on one page; tr.total is glued to the previous row
     so it never orphans onto a new page without context. */
  .items { width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:8px }
  .items thead th { font-weight:normal; color:${MUTED}; font-size:9pt; padding:6px 10px 10px 0; border-bottom:1px solid #BBB; text-align:left }
  .items thead th.num, .items thead th.qty, .items thead th.rate { text-align:right }
  .items thead th.num { padding-right:0 }
  /* The spacer row sits in <thead> so Chromium auto-repeats it on every page
     where the table breaks. That gives spillover pages a top whitespace band
     instead of starting flush against the page edge. The first items page
     also picks up the spacer below its meta-list -- consistent across pages. */
  .items thead tr.spacer th { padding:0; height:80px; border-bottom:0 }
  /* <tfoot> auto-repeats on every page like <thead>; using it as a bottom
     spacer reserves whitespace below the rows on every spillover page so the
     last row never butts up against the page edge. */
  .items tfoot tr.spacer td { padding:0; height:60px; border:0 }
  .items tbody tr { break-inside:avoid; page-break-inside:avoid }
  .items tbody td { padding:5px 10px 5px 0; vertical-align:top; border-bottom:1px solid #F2F2F2 }
  .items tbody tr:last-child td { border-bottom:0 }
  .items td.desc { width:auto }
  .items td.qty { width:50px; text-align:right; padding-right:14px }
  .items td.rate { width:50px; text-align:right; padding-right:14px; color:${MUTED} }
  .items td.num { width:80px; text-align:right; padding-right:0; font-variant-numeric:tabular-nums }
  .items tr.total td { padding-top:12px; padding-bottom:6px; border-top:1px solid #333; font-weight:700 }
  .items tr.total { break-before:avoid; page-break-before:avoid }
</style></head><body>
  <section class="page">
    <div class="band">
      <div class="logo">${BAC_LOGO}</div>
      <div class="lockup">
        <div class="lbl">Invoice</div>
        <div class="ref">${escapeHtml(options.reference)}</div>
      </div>
    </div>

    <div class="body">
      <div class="top">
        <div class="recipient">
          <p>${escapeHtml(options.addressee)}<br>
          ${attentionLine}${escapeHtml(options.address.street)}<br>
          ${escapeHtml(options.address.postalCode)} ${escapeHtml(options.address.city)}<br>
          ${escapeHtml(options.address.country)}</p>
        </div>
        <div class="meta-list">
          <div class="row"><span class="lbl">Date</span><span class="v">${escapeHtml(options.date)}</span></div>
          <div class="row"><span class="lbl">Invoice number</span><span class="v">${escapeHtml(options.reference)}</span></div>
          <div class="row"><span class="lbl">Customer number</span><span class="v">${escapeHtml(options.customerNumber)}</span></div>
          <div class="row"><span class="lbl">Sequence number</span><span class="v">${escapeHtml(options.identifier)}</span></div>
          <div class="row"><span class="lbl">Due date</span><span class="v">${escapeHtml(options.dueDate)}</span></div>
        </div>
      </div>

      ${subjectSection}

      <div class="total-headline">
        <div class="h">Total including VAT ${fmt(options.totalIncl)}</div>
        <div class="note">
          The amount of <strong>${fmt(options.totalIncl)}</strong> must be paid within
          <strong>${BAC.paymentTermDays} days</strong> (before <strong>${escapeHtml(options.dueDate)}</strong>)
          to
          <span style="white-space:nowrap"><strong>${escapeHtml(BAC.iban)}</strong></span>
          in the name of ${escapeHtml(BAC.name)}, with reference
          <strong>${escapeHtml(options.reference)}</strong>.
        </div>
      </div>

      <table class="spec">
        <thead>
          <tr>
            <th>Description</th>
            <th>VAT</th>
            <th class="num">Excl. VAT</th>
            <th class="num">VAT amount</th>
            <th class="num">Incl. VAT</th>
          </tr>
        </thead>
        <tbody>
          ${vatRows}
          <tr class="total">
            <td class="muted">All amounts in euros</td>
            <td class="bold">Total</td>
            <td class="num bold">${fmt(options.subtotalExcl)}</td>
            <td class="num bold">${fmt(options.totalVat)}</td>
            <td class="num bold">${fmt(options.totalIncl)}</td>
          </tr>
        </tbody>
      </table>

      <div class="questions">Questions about this invoice? Email ${escapeHtml(BAC.email)}</div>
    </div>

    <div class="page-foot">
      <div class="col">
        <strong>${escapeHtml(BAC.name)}</strong>
        ${escapeHtml(BAC.street)}<br>
        ${escapeHtml(BAC.postalCity)}
      </div>
      <div class="col">
        <strong style="visibility:hidden">&nbsp;</strong>
        VAT ${escapeHtml(BAC.vat)}<br>
        KvK ${escapeHtml(BAC.kvk)}
      </div>
      <div class="col">
        <strong style="visibility:hidden">&nbsp;</strong>
        IBAN ${escapeHtml(BAC.iban)}
      </div>
      <div class="col">
        <strong>contact</strong>
        ${escapeHtml(BAC.email)}<br>
        ${escapeHtml(BAC.phone)}
      </div>
    </div>
  </section>

  <section class="items-flow">
    <div class="band">
      <div class="logo">${BAC_LOGO}</div>
      <div class="lockup">
        <div class="lbl">Line items</div>
        <div class="ref">${escapeHtml(options.reference)}</div>
      </div>
    </div>

    <div class="body">
      <div class="top" style="margin-bottom:24px">
        <div></div>
        <div class="meta-list">
          <div class="row"><span class="lbl">Date</span><span class="v">${escapeHtml(options.date)}</span></div>
          <div class="row"><span class="lbl">Invoice number</span><span class="v">${escapeHtml(options.reference)}</span></div>
        </div>
      </div>

      <table class="items">
        <thead>
          <tr class="spacer"><th colspan="6"></th></tr>
          <tr>
            <th class="desc">Description</th>
            <th class="qty">Qty</th>
            <th class="rate">VAT</th>
            <th class="num">Excl. VAT</th>
            <th class="num">VAT amount</th>
            <th class="num">Incl. VAT</th>
          </tr>
        </thead>
        <tfoot>
          <tr class="spacer"><td colspan="6"></td></tr>
        </tfoot>
        <tbody>
          ${lineItemRows}
          <tr class="total">
            <td></td>
            <td></td>
            <td>Total</td>
            <td class="num">${fmt(options.subtotalExcl)}</td>
            <td class="num">${fmt(options.totalVat)}</td>
            <td class="num">${fmt(options.totalIncl)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</body></html>`;
}
