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
  FileSettings, Identity,
  ISellerPayoutRouteParams,
  Language, Product, ProductPricing,
  ReturnFileType, SellerPayoutParameters,
  SellerPayoutRouteParams, TotalPricing, VAT,
} from 'pdf-generator-client';
import { PDF_GEN_URL, PDF_VAT_HIGH, PDF_VAT_LOW, PDF_VAT_ZERO, UNUSED_PARAM } from '../helpers/pdf';
import FileService from './file-service';
import { SELLER_PAYOUT_PDF_LOCATION } from '../files/storage';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import { FindOptionsRelations } from 'typeorm';
import SellerPayoutPdf from '../entity/file/seller-payout-pdf';
import { SalesReportService } from './report-service';
import { ReportProductEntry, ReportVatEntry } from '../entity/report/report';
import assert from 'assert';

export default class SellerPayoutPdfService {

  static pdfGenerator: PdfGenerator = {
    client: new Client(PDF_GEN_URL, { fetch }),
    fileService: new FileService(SELLER_PAYOUT_PDF_LOCATION),
  };

  static vatPercentageToPDFVat(percentage: number): VAT {
    switch (percentage) {
      case PDF_VAT_LOW:
        return VAT.LOW;
      case PDF_VAT_HIGH:
        return VAT.HIGH;
      case PDF_VAT_ZERO:
        return VAT.ZERO;
      default:
        throw new Error(`Unknown VAT percentage: ${percentage}`);
    }
  }

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

    // TODO: make function when sales-report is merged
    const sales: Product[] = [];

    if (report.data.products.length === 0) throw new Error('No products found in report');
    report.data.products.forEach((s: ReportProductEntry) => {
      sales.push(new Product({
        name: s.product.name,
        summary: s.product.name,
        pricing: new ProductPricing({
          basePrice: s.product.priceInclVat.getAmount(),
          vatAmount: s.product.vat.percentage,
          vatCategory: this.vatPercentageToPDFVat(s.product.vat.percentage),
          quantity: s.count,
        }),
      }));
    });

    const lowVatGroup = report.data.vat.find((v: ReportVatEntry) => v.vat.percentage === PDF_VAT_LOW);
    if (!lowVatGroup) throw new Error('No low VAT group found in report');
    const highVatGroup = report.data.vat.find((v: ReportVatEntry) => v.vat.percentage === PDF_VAT_HIGH);
    if (!highVatGroup) throw new Error('No high VAT group found in report');

    const total = new TotalPricing({
      exclVat: report.totalExclVat.getAmount(),
      lowVat: lowVatGroup.totalInclVat.getAmount() - lowVatGroup.totalExclVat.getAmount(),
      highVat: highVatGroup.totalInclVat.getAmount() - highVatGroup.totalExclVat.getAmount(),
      inclVat: report.totalInclVat.getAmount(),
    });

    return new SellerPayoutParameters({
      reference: `SDS-SP-${String(sellerPayout.id).padStart(4, '0')}`,
      startDate,
      endDate,
      entries: sales,
      total,
      description: reference,
      debtorId: sellerPayout.requestedBy.id,
      account: new Identity({
        firstName: sellerPayout.requestedBy.firstName,
        lastName: UNUSED_PARAM,
        lastNamePreposition: UNUSED_PARAM,
        fullName: `${sellerPayout.requestedBy.firstName} ${sellerPayout.requestedBy.lastName}`,
        function: UNUSED_PARAM,
      }),
    });
  }

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

  public static async createPdf(sellerPayoutId: number): Promise<SellerPayoutPdf> {
    const relations: FindOptionsRelations<SellerPayout> = {
      requestedBy: true,
      transfer: true,
    };
    const sellerPayout = await SellerPayout.findOne({ where: { id: sellerPayoutId }, relations });
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
