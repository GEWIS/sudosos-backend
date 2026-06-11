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
 * Invoice PDF (the "F6c" design). A thin wrapper over the shared
 * `createDocumentPdf` skeleton: an invoice is that document with an "Invoice"
 * band label, the recipient address block, invoice meta rows and the payment
 * instructions note. Compiled to a PDF by `pdf-compiler`.
 */

import { BAC } from '../files/templates/bac-letterhead';
import {
  createDocumentPdf,
  escapeHtml,
  fmt,
  IDocumentLineItem,
  IDocumentVatBand,
  subjectSection,
} from './document.html';

export interface IInvoiceAddress {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

/** One row in the cover-page BTW specification matrix (per-VAT-band totals). */
export interface IInvoiceVatBand extends IDocumentVatBand {}

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
  /** "For the attention of" recipient line. Rendered as `Attn. <name>` between
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

/**
 * Render the Invoice PDF HTML via the shared document skeleton.
 */
export function createInvoicePdf(options: IInvoicePdf): string {
  const attention = (options.attention ?? '').trim();
  const attentionLine = attention.length === 0
    ? ''
    : `Attn. ${escapeHtml(attention)}<br>`;

  const recipientHtml = `<p>${escapeHtml(options.addressee)}<br>
          ${attentionLine}${escapeHtml(options.address.street)}<br>
          ${escapeHtml(options.address.postalCode)} ${escapeHtml(options.address.city)}<br>
          ${escapeHtml(options.address.country)}</p>`;

  const noteHtml = `
          The amount of <strong>${fmt(options.totalIncl)}</strong> must be paid within
          <strong>${BAC.paymentTermDays} days</strong> (before <strong>${escapeHtml(options.dueDate)}</strong>)
          to
          <span style="white-space:nowrap"><strong>${escapeHtml(BAC.iban)}</strong></span>
          in the name of ${escapeHtml(BAC.name)}, with reference
          <strong>${escapeHtml(options.reference)}</strong>.`;

  const lineItems: IDocumentLineItem[] = [...options.lineItems]
    .sort((a, b) => a.id - b.id)
    .map((it) => ({
      description: it.description,
      qty: it.qty,
      rate: it.rate,
      excl: it.excl,
      vat: it.vat,
      incl: it.incl,
    }));

  return createDocumentPdf({
    bandLabel: 'Invoice',
    reference: options.reference,
    recipientHtml,
    metaRows: [
      { lbl: 'Date', v: escapeHtml(options.date) },
      { lbl: 'Invoice number', v: escapeHtml(options.reference) },
      { lbl: 'Customer number', v: escapeHtml(options.customerNumber) },
      { lbl: 'Sequence number', v: escapeHtml(options.identifier) },
      { lbl: 'Due date', v: escapeHtml(options.dueDate) },
    ],
    subjectSection: subjectSection('Subject', options.subject),
    totalIncl: options.totalIncl,
    totalLabel: 'Total including VAT',
    noteHtml,
    specDescription: 'Orders',
    vatBreakdown: options.vatBreakdown,
    subtotalExcl: options.subtotalExcl,
    totalVat: options.totalVat,
    questionsLine: `Questions about this invoice? Email ${escapeHtml(BAC.email)}`,
    lineItemsLabel: 'Line items',
    lineItemsMetaRows: [
      { lbl: 'Date', v: escapeHtml(options.date) },
      { lbl: 'Invoice number', v: escapeHtml(options.reference) },
    ],
    lineItems,
  });
}
