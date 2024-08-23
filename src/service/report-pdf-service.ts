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
import {
  Client, FileResponse,
  FileSettings,
  FineReportParameters,
  FineRouteParams, IFileSettings,
  Language,
  Product,
  ProductPricing,
  ReturnFileType,
  TotalPricing, UserReportParameters, UserReportParametersType, UserRouteParams,
  VAT,
} from 'pdf-generator-client';
import { FineReport } from '../controller/response/debtor-response';
import {
  entryToProduct,
  getPDFTotalsFromReport,
  PDF_GEN_URL,
  PDF_VAT_HIGH,
  UNUSED_NUMBER,
  UNUSED_PARAM, userToIdentity,
} from '../helpers/pdf';
import User from '../entity/user/user';
import { Report, ReportProductEntry } from '../entity/report/report';

const HANDED_OUT_FINES = 'Handed out';
const WAIVED_FINES = 'Waived';

export default class ReportPdfService {

  static fileSettings: IFileSettings = {
    createdAt: undefined,
    name:  'Report',
    language: Language.DUTCH,
    fileType: ReturnFileType.PDF,
    stationery: 'BAC',
  };

  static client =  new Client(PDF_GEN_URL, { fetch });


  static fineReportToParameters(report: FineReport): FineReportParameters {
    const handedOut =  new Product({
      name: HANDED_OUT_FINES,
      summary: UNUSED_PARAM,
      pricing: new ProductPricing({
        basePrice: report.handedOut.getAmount(),
        vatAmount: PDF_VAT_HIGH,
        // is actually unused
        vatCategory: VAT.ZERO,
        quantity: report.count,
      }),
    });
    const fines = [handedOut];
    if (report.waivedCount > 0) {
      const waived = new Product({
        name: WAIVED_FINES,
        summary: UNUSED_PARAM,
        pricing: new ProductPricing({
          basePrice: report.waivedAmount.getAmount() * -1,
          vatAmount: PDF_VAT_HIGH,
          // is actually unused
          vatCategory: VAT.ZERO,
          quantity: report.waivedCount,
        }),
      });
      fines.push(waived);
    }
    const inclVat = report.handedOut.getAmount() - report.waivedAmount.getAmount();
    const exclVat =  Math.round(inclVat  / (1 + (PDF_VAT_HIGH / 100)));
    const highVat = inclVat - exclVat;

    const total = new TotalPricing({
      exclVat,
      lowVat: UNUSED_NUMBER,
      highVat,
      inclVat,
    });

    return new FineReportParameters({
      startDate: report.fromDate,
      endDate: report.toDate,
      fines,
      total,
    });
  }

  /**
   * Generate a pdf report of the given fine report.
   * @returns Buffer - The pdf report
   * @param report
   * @param fileType
   */
  public static async getFineReportPdf(report: FineReport, fileType = ReturnFileType.PDF): Promise<Buffer> {
    const fineRouteParams: FineRouteParams = new FineRouteParams({
      params: ReportPdfService.fineReportToParameters(report),
      settings: new FileSettings({ ...ReportPdfService.fileSettings, createdAt: new Date(), fileType }),
    });

    try {
      const res: FileResponse = await ReportPdfService.client.generateFineReport(fineRouteParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      throw new Error(`Fine report generation failed: ${res.message}`);
    }
  }

  /**
   * Convert Report to UserReportParameters
   * @param report
   * @param type
   * @param description
   */
  private static async userReportToParameters(report: Report, type: UserReportParametersType, description: string): Promise<UserReportParameters> {
    const sales: Product[] = [];

    if (!report.data.products) throw new Error('No products found in report');
    report.data.products.forEach((s: ReportProductEntry) => entryToProduct(s));

    const user = await User.findOne({ where: { id: report.forId } });

    return new UserReportParameters({
      account: userToIdentity(user),
      startDate: report.fromDate,
      endDate: report.tillDate,
      description,
      entries: sales,
      type,
      total: getPDFTotalsFromReport(report),
    });
  }

  /**
   * Generate a pdf report of the given report.
   * @param report
   * @param description
   * @param type
   * @param fileType
   */
  public static async getReportPdf(report: Report, description: string, type: UserReportParametersType, fileType = ReturnFileType.PDF): Promise<Buffer> {
    const salesRouteParams: UserRouteParams = new UserRouteParams({
      params: await ReportPdfService.userReportToParameters(report, type, description),
      settings: new FileSettings({ ...ReportPdfService.fileSettings, createdAt: new Date(), fileType }),
    });

    try {
      const res: FileResponse = await ReportPdfService.client.generateUserReport(salesRouteParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      console.error(res);
      throw new Error(`User report generation failed: ${res.message}`);
    }
  }
}
