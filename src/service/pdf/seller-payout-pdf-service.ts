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
 * This is the page of seller-payout-pdf-service.
 *
 * @module internal/pdf/seller-payout-pdf-service
 */

import SellerPayout from '../../entity/transactions/payout/seller-payout';
import SellerPayoutPdf from '../../entity/file/seller-payout-pdf';
import { createSellerPayoutPdf, ISellerPayoutPdf } from '../../html/seller-payout.html';
import { SalesReportService } from '../report-service';
import { HtmlPdfService } from './pdf-service';

export default class SellerPayoutPdfService extends HtmlPdfService<SellerPayoutPdf, SellerPayout, ISellerPayoutPdf> {
  pdfConstructor = SellerPayoutPdf;

  htmlGenerator = createSellerPayoutPdf;

  async getParameters(entity: SellerPayout): Promise<ISellerPayoutPdf> {
    const { startDate, endDate, reference, requestedBy } = entity;
    const report = await new SalesReportService().getReport({
      fromDate: startDate,
      tillDate: endDate,
      forId: requestedBy.id,
    });

    const lineItems = (report.data.products ?? [])
      .map((p) => {
        const excl = p.totalExclVat.getAmount();
        const incl = p.totalInclVat.getAmount();
        return {
          description: p.product.name,
          qty: p.count,
          rate: p.product.vat.percentage,
          excl: excl / 100,
          vat: (incl - excl) / 100,
          incl: incl / 100,
        };
      })
      .sort((a, b) => a.description.localeCompare(b.description));

    const vatBreakdown = (report.data.vat ?? [])
      .map((v) => {
        const excl = v.totalExclVat.getAmount();
        const incl = v.totalInclVat.getAmount();
        return {
          rate: v.vat.percentage,
          excl: excl / 100,
          vat: (incl - excl) / 100,
          incl: incl / 100,
        };
      })
      .sort((a, b) => a.rate - b.rate);

    const exclCents = report.totalExclVat.getAmount();
    const inclCents = report.totalInclVat.getAmount();

    return {
      reference: `SDS-SP-${String(entity.id).padStart(4, '0')}`,
      identifier: String(entity.id),
      description: reference,
      account: [requestedBy.firstName, requestedBy.lastName].filter(Boolean).join(' '),
      customerNumber: String(requestedBy.id),
      startDate: startDate.toLocaleDateString('nl-NL'),
      endDate: endDate.toLocaleDateString('nl-NL'),
      vatBreakdown,
      lineItems,
      totalIncl: inclCents / 100,
      subtotalExcl: exclCents / 100,
      totalVat: (inclCents - exclCents) / 100,
    };
  }
}
