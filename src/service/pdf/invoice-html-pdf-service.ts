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
 * This is the page of invoice-html-pdf-service.
 *
 * @module internal/pdf/invoice-html-pdf-service
 */

import Invoice from '../../entity/invoices/invoice';
import InvoicePdf from '../../entity/file/invoice-pdf';
import { HtmlPdfService } from './pdf-service';
import {
  createInvoicePdf,
  IInvoiceLineItem,
  IInvoicePdf,
  IInvoiceVatBand,
} from '../../html/invoice.html';
import InvoiceService from '../invoice-service';
import { InvoiceState } from '../../entity/invoices/invoice-status';
import SubTransactionRow from '../../entity/transactions/sub-transaction-row';
import { BAC } from '../../files/templates/bac-letterhead';

export default class InvoiceHtmlPdfService extends HtmlPdfService<InvoicePdf, Invoice, IInvoicePdf> {
  pdfConstructor = InvoicePdf;

  htmlGenerator = createInvoicePdf;

  async getParameters(invoice: Invoice): Promise<IInvoicePdf> {
    const rows = (InvoiceService.isState(invoice, InvoiceState.DELETED)
      ? invoice.subTransactionRowsDeletedInvoice
      : invoice.subTransactionRows) as SubTransactionRow[];

    let subtotalExclCents = 0;
    let totalVatCents = 0;
    // Per-VAT-rate aggregation, in cents to avoid float drift.
    const bandCents = new Map<number, { excl: number; vat: number; incl: number }>();
    const lineItems: IInvoiceLineItem[] = [];

    for (const r of rows) {
      const inclVatCents = r.product.priceInclVat.getAmount();
      const vatRate = r.product.vat.percentage;
      const exclVatPerUnit = Math.round(inclVatCents / (1 + vatRate / 100));
      const base = exclVatPerUnit * r.amount;
      const vat = (inclVatCents - exclVatPerUnit) * r.amount;
      const incl = inclVatCents * r.amount;
      subtotalExclCents += base;
      totalVatCents += vat;

      const band = bandCents.get(vatRate) ?? { excl: 0, vat: 0, incl: 0 };
      band.excl += base;
      band.vat += vat;
      band.incl += incl;
      bandCents.set(vatRate, band);

      lineItems.push({
        id: r.id,
        description: r.product.name,
        qty: r.amount,
        rate: vatRate,
        excl: base / 100,
        vat: vat / 100,
        incl: incl / 100,
      });
    }

    // Ascending rate: 0% (None) first, then 9%, then 21%.
    const vatBreakdown: IInvoiceVatBand[] = Array.from(bandCents.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rate, { excl, vat, incl }]) => ({
        rate,
        excl: excl / 100,
        vat: vat / 100,
        incl: incl / 100,
      }));

    lineItems.sort((a, b) => a.id - b.id);

    // Add paymentTermDays as calendar days (setDate handles DST transitions)
    // rather than fixed 24h * N milliseconds, and format in local time to match
    // TransactionPdfService / TransferPdfService -- Invoice.date is a MySQL
    // `datetime` with no timezone, so UTC formatting can shift the day boundary
    // for invoices created near midnight in non-UTC server timezones.
    const dueDate = new Date(invoice.date);
    dueDate.setDate(dueDate.getDate() + BAC.paymentTermDays);

    return {
      reference: invoice.reference ?? '',
      identifier: String(invoice.id),
      date: invoice.date.toLocaleDateString('nl-NL'),
      dueDate: dueDate.toLocaleDateString('nl-NL'),
      customerNumber: String(invoice.toId),
      subject: invoice.description ?? '',
      addressee: invoice.addressee ?? '',
      attention: invoice.attention ?? '',
      address: {
        street: invoice.street ?? '',
        postalCode: invoice.postalCode ?? '',
        city: invoice.city ?? '',
        country: invoice.country ?? '',
      },
      vatBreakdown,
      lineItems,
      totalIncl: (subtotalExclCents + totalVatCents) / 100,
      subtotalExcl: subtotalExclCents / 100,
      totalVat: totalVatCents / 100,
    };
  }
}
