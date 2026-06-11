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
 * Seller Payout / disbursement PDF. The same "F6c" document as the Invoice,
 * with a "Seller Disbursement" band label, the payout meta rows and the
 * disbursement explanation note. Compiled to a PDF by `pdf-compiler`.
 */

import {
  createDocumentPdf,
  escapeHtml,
  fmt,
  IDocumentLineItem,
  IDocumentVatBand,
  subjectSection,
} from './document.html';
import { BAC } from '../files/templates/bac-letterhead';

/** One row in the cover-page VAT specification matrix (per-VAT-band totals). */
export interface ISellerPayoutVatBand extends IDocumentVatBand {}

/** One line item: a product sold in the payout period. */
export interface ISellerPayoutLineItem extends IDocumentLineItem {}

export interface ISellerPayoutPdf {
  /** Payout number, e.g. SDS-SP-0001. */
  reference: string;
  /** SellerPayout.id, shown as "Sequence number". */
  identifier: string;
  /** Free-text payout description; rendered as a "Description" section. */
  description: string;
  /** Seller account name (the payee). */
  account: string;
  /** The seller's User.id, shown as "Customer number". */
  customerNumber: string;
  startDate: string;
  endDate: string;
  vatBreakdown: ISellerPayoutVatBand[];
  lineItems: ISellerPayoutLineItem[];
  totalIncl: number;
  subtotalExcl: number;
  totalVat: number;
}

/**
 * Render the Seller Payout PDF HTML via the shared document skeleton.
 */
export function createSellerPayoutPdf(options: ISellerPayoutPdf): string {
  const noteHtml = `
          This is a payout of your balance in the SudoSOS system based on your sales in the period
          <strong>${escapeHtml(options.startDate)}</strong> to <strong>${escapeHtml(options.endDate)}</strong>.
          As a seller, you will receive the total amount of sales <strong>${fmt(options.totalIncl)}</strong>
          including VAT and are responsible for payment of VAT in the amount of <strong>${fmt(options.totalVat)}</strong>.`;

  return createDocumentPdf({
    bandLabel: 'Seller Disbursement',
    reference: options.reference,
    // The account is shown in the meta-list (top right), so the recipient block stays empty.
    recipientHtml: '',
    metaRows: [
      { lbl: 'Payout number', v: escapeHtml(options.reference) },
      { lbl: 'Account', v: escapeHtml(options.account) },
      { lbl: 'Start date', v: escapeHtml(options.startDate) },
      { lbl: 'End date', v: escapeHtml(options.endDate) },
      { lbl: 'Customer number', v: escapeHtml(options.customerNumber) },
    ],
    subjectSection: subjectSection('Description', options.description),
    totalIncl: options.totalIncl,
    totalLabel: 'Payout including VAT',
    noteHtml,
    specDescription: 'Sales',
    vatBreakdown: options.vatBreakdown,
    subtotalExcl: options.subtotalExcl,
    totalVat: options.totalVat,
    questionsLine: `Questions about this payout? Email ${escapeHtml(BAC.email)}`,
    lineItemsLabel: 'Line items',
    lineItemsMetaRows: [
      { lbl: 'Payout number', v: escapeHtml(options.reference) },
      { lbl: 'Account', v: escapeHtml(options.account) },
    ],
    lineItems: options.lineItems,
  });
}
