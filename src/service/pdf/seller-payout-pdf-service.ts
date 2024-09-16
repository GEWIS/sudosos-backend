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

import {
  FileResponse,
  SellerPayoutParameters,
  SellerPayoutRouteParams,
} from 'pdf-generator-client';
import {
  entryToProduct,
  getPDFTotalsFromReport,
  userToIdentity,
} from '../../helpers/pdf';
import SellerPayout from '../../entity/transactions/payout/seller-payout';
import SellerPayoutPdf from '../../entity/file/seller-payout-pdf';
import { SalesReportService } from '../report-service';
import { ReportProductEntry } from '../../entity/report/report';
import { PdfService } from './pdf-service';

export default class SellerPayoutPdfService extends PdfService<SellerPayoutPdf, SellerPayout, SellerPayoutRouteParams> {
  generator(routeParams: SellerPayoutRouteParams): Promise<FileResponse> {
    return this.client.generateDisbursement(routeParams);
  }

  async getParameters(entity: SellerPayout): Promise<SellerPayoutParameters> {
    const { startDate, endDate, reference } = entity;
    const report = await new SalesReportService().getReport({
      fromDate: startDate,
      tillDate: endDate,
      forId: entity.requestedBy.id,
    });

    const entries = report.data.products.map((s: ReportProductEntry) => entryToProduct(s));
    entries.sort((a, b) => a.name.localeCompare(b.name));

    return new SellerPayoutParameters({
      reference: `SDS-SP-${String(entity.id).padStart(4, '0')}`,
      startDate,
      endDate,
      entries,
      total: getPDFTotalsFromReport(report),
      description: reference,
      debtorId: entity.requestedBy.id,
      account: userToIdentity(entity.requestedBy),
    });
  }

  pdfConstructor = SellerPayoutPdf;

  routeConstructor = SellerPayoutRouteParams;
}
