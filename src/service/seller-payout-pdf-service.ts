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
 */
import { PdfGenerator } from '../entity/file/pdf-file';
import {
  Client,
  FileSettings, ISellerPayoutRouteParams,
  Language, ReturnFileType, SellerPayoutParameters,
  SellerPayoutRouteParams,
} from 'pdf-generator-client';
import {
  entryToProduct,
  getPDFTotalsFromReport,
  PDF_GEN_URL,
  userToIdentity,
} from '../helpers/pdf';
import FileService from './file-service';
import { SELLER_PAYOUT_PDF_LOCATION } from '../files/storage';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import SellerPayoutPdf from '../entity/file/seller-payout-pdf';
import { SalesReportService } from './report-service';
import { ReportProductEntry } from '../entity/report/report';
import assert from 'assert';
import SellerPayoutService from './seller-payout-service';

export default class SellerPayoutPdfService {

  static pdfGenerator: PdfGenerator = {
    client: new Client(PDF_GEN_URL, { fetch }),
    fileService: new FileService(SELLER_PAYOUT_PDF_LOCATION),
  };

  /**
   * get the parameters required for generating an seller payout PDF.
   * @param sellerPayout
   */
  static async getParameters(sellerPayout: SellerPayout): Promise<SellerPayoutParameters> {
    const { amount, startDate, endDate, reference } = sellerPayout;
    const report = await new SalesReportService().getReport({
      fromDate: startDate,
      tillDate: endDate,
      forId: sellerPayout.requestedBy.id,
    });

    // TODO? throw error if amount and report amount are different?
    console.error(amount.getAmount(), report.totalInclVat.getAmount());
    assert(amount.getAmount() === report.totalInclVat.getAmount(), 'Amounts do not match');

    const entries = report.data.products.map((s: ReportProductEntry) => entryToProduct(s));
    entries.sort((a, b) => a.name.localeCompare(b.name));

    return new SellerPayoutParameters({
      reference: `SDS-SP-${String(sellerPayout.id).padStart(4, '0')}`,
      startDate,
      endDate,
      entries,
      total: getPDFTotalsFromReport(report),
      description: reference,
      debtorId: sellerPayout.requestedBy.id,
      account: userToIdentity(sellerPayout.requestedBy),
    });
  }

  /**
   * Prepares and returns the parameters required by the PDF generator client to create an seller payout PDF.
   * @param sellerPayout
   */
  static async getPdfParams(sellerPayout: SellerPayout): Promise<SellerPayoutRouteParams> {
    const params = await this.getParameters(sellerPayout);

    const settings: FileSettings = new FileSettings({
      createdAt: new Date(),
      fileType: ReturnFileType.PDF,
      language: Language.ENGLISH,
      name: '',
      stationery: 'BAC',
    });

    const data: ISellerPayoutRouteParams = {
      params,
      settings,
    };

    return new SellerPayoutRouteParams(data);
  }

  /**
   * Generate a pdf report of the given report.
   * @param sellerPayoutId
   */
  public static async createPdf(sellerPayoutId: number): Promise<SellerPayoutPdf> {
    const sellerPayout = await SellerPayout.findOne(SellerPayoutService.getOptions({ sellerPayoutId, returnTransfer: true }));
    if (!sellerPayout) return undefined;

    const params = await this.getPdfParams(sellerPayout);
    try {
      const res = await this.pdfGenerator.client.generateDisbursement(params);
      const blob = res.data;
      const buffer = Buffer.from(await blob.arrayBuffer());
      return await this.pdfGenerator.fileService.uploadPdf(sellerPayout, SellerPayoutPdf, buffer, sellerPayout.requestedBy);
    } catch (res: any) {
      throw new Error(`Payout generation failed: ${res.message}`);
    }
  }
}
