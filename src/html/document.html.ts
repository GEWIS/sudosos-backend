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
 * Shared HTML skeleton for the BAC "F6c" two-section financial document: an
 * AH-style cover page (band header, recipient block, meta-list, total
 * headline + note, VAT specification, footer) followed by one or more
 * line-items pages. The Invoice and the Seller Payout PDFs are both this
 * document with a different band label, meta rows and note text.
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

/** One row in the cover-page VAT specification matrix (per-VAT-band totals). */
export interface IDocumentVatBand {
  /** VAT percentage; 0 renders as "None" on the cover. */
  rate: number;
  /** Sum of the excl-VAT amount across rows in this band, in euros. */
  excl: number;
  /** Sum of the VAT amount across rows in this band, in euros. */
  vat: number;
  /** Sum of the incl-VAT amount across rows in this band, in euros. */
  incl: number;
}

/** One row in the line-items page. */
export interface IDocumentLineItem {
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

/** A label/value pair in one of the right-aligned meta-lists. */
export interface IDocumentMetaRow {
  lbl: string;
  /** Pre-escaped value; rendered raw. */
  v: string;
}

export interface IDocumentPdf {
  /** Small uppercase lockup label in the header band (e.g. "Invoice"). */
  bandLabel: string;
  /** Large reference shown under the band label and on the line-items page. */
  reference: string;
  /** Pre-rendered recipient/account block (already escaped). */
  recipientHtml: string;
  /** Cover-page meta-list rows (values already escaped). */
  metaRows: IDocumentMetaRow[];
  /** Optional pre-rendered section between the meta block and the headline. */
  subjectSection?: string;
  totalIncl: number;
  /** Headline label shown before the total amount (e.g. "Total including VAT"). */
  totalLabel: string;
  /** Pre-rendered paragraph under the total headline (already escaped). */
  noteHtml: string;
  /** Description shown in every VAT-spec row (e.g. "Orders" / "Sales"). */
  specDescription: string;
  vatBreakdown: IDocumentVatBand[];
  subtotalExcl: number;
  totalVat: number;
  /** Pre-rendered line under the VAT spec (already escaped). */
  questionsLine: string;
  /** Lockup label on the line-items page band. */
  lineItemsLabel: string;
  /** Line-items page meta-list rows (values already escaped). */
  lineItemsMetaRows: IDocumentMetaRow[];
  lineItems: IDocumentLineItem[];
}

const eur = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a euro amount in nl-NL style with the locale's no-break space
 *  between symbol and amount removed (e.g. €1.234,56). */
export const fmt = (n: number): string => eur.format(n).replace(/\s/g, '');

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function metaList(rows: IDocumentMetaRow[]): string {
  return rows
    .map((r) => `<div class="row"><span class="lbl">${r.lbl}</span><span class="v">${r.v}</span></div>`)
    .join('\n          ');
}

/**
 * Render the optional labeled section between the meta block and the total
 * headline (e.g. "Subject" on the invoice, "Description" on the seller
 * payout). Returns an empty string when the value is empty.
 */
export function subjectSection(label: string, value: string): string {
  const v = (value ?? '').trim();
  if (v.length === 0) return '';
  return `
    <section style="margin-bottom:40px">
      <div style="font-size:9.5pt; color:${MUTED}; text-transform:uppercase; letter-spacing:1.2px; font-weight:600; margin-bottom:6px">${escapeHtml(label)}</div>
      <div style="font-size:13pt; font-weight:600">${escapeHtml(v)}</div>
    </section>`;
}

/**
 * Render the two-section financial document HTML.
 *
 * Output is a complete `<html>` document, ready to POST to pdf-compiler's
 * `/compile-html` endpoint.
 */
export function createDocumentPdf(options: IDocumentPdf): string {
  const vatRows = options.vatBreakdown.map((b) => `
    <tr>
      <td class="desc">${escapeHtml(options.specDescription)}</td>
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

  /* Line-items page: per-row items table. Compact rows so a typical document
     fits on one page; tr.total is glued to the previous row so it never
     orphans onto a new page without context. */
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
        <div class="lbl">${escapeHtml(options.bandLabel)}</div>
        <div class="ref">${escapeHtml(options.reference)}</div>
      </div>
    </div>

    <div class="body">
      <div class="top">
        <div class="recipient">${options.recipientHtml}</div>
        <div class="meta-list">
          ${metaList(options.metaRows)}
        </div>
      </div>

      ${options.subjectSection ?? ''}

      <div class="total-headline">
        <div class="h">${escapeHtml(options.totalLabel)} ${fmt(options.totalIncl)}</div>
        <div class="note">${options.noteHtml}</div>
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

      <div class="questions">${options.questionsLine}</div>
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
        <div class="lbl">${escapeHtml(options.lineItemsLabel)}</div>
        <div class="ref">${escapeHtml(options.reference)}</div>
      </div>
    </div>

    <div class="body">
      <div class="top" style="margin-bottom:24px">
        <div></div>
        <div class="meta-list">
          ${metaList(options.lineItemsMetaRows)}
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
