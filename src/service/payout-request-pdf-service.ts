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
import { Client, FileResponse } from 'pdf-generator-client';
import PayoutRequest from '../entity/transactions/payout-request';
import FileService from './file-service';
import {
  PayoutParameters,
  PayoutRouteParams,
  Payout,
  FileSettings,
  ReturnFileType,
  Language,
  IPayoutRouteParams,
} from 'pdf-generator-client';
import { PAYOUT_REQUEST_PDF_LOCATION } from '../files/storage';
import { PdfGenerator } from '../entity/file/pdf-file';
import PayoutRequestPdf from '../entity/file/payout-request-pdf';
import { PDF_GEN_URL } from '../helpers/pdf';

export default class PayoutRequestPdfService {

  static pdfGenerator: PdfGenerator = {
    client: new Client(PDF_GEN_URL, { fetch }),
    fileService: new FileService(PAYOUT_REQUEST_PDF_LOCATION),
  };


  /**
   * Constructs and returns the parameters required for generating a payout request PDF.
   * @param payoutRequest - The payout request for which to generate the parameters.
   * @returns {PayoutParameters} An instance of `PayoutParameters` containing all necessary information for PDF generation.
   */
  static getParameters(payoutRequest: PayoutRequest): PayoutParameters {
    return new PayoutParameters({
      payout: new Payout({
        bankAccountName: payoutRequest.bankAccountName,
        bankAccountNumber: payoutRequest.bankAccountNumber,
        amount: payoutRequest.amount.getAmount(),
        reference: `SDS-PR-${String(payoutRequest.id).padStart(4, '0')}`,
        date: payoutRequest.createdAt,
        debtorNumber: String(payoutRequest.requestedBy.id),
      }),
    });
  }

  /**
   * Prepares and returns the parameters required by the PDF generator client to create a payout request PDF.
   * @param payoutRequest - The payout request for which to generate the parameters.
   * @returns {PayoutRouteParams} An instance of `PayoutRouteParams` containing the consolidated parameters and settings for PDF generation.
   */
  static getPdfParams(payoutRequest: PayoutRequest): PayoutRouteParams {
    const params = this.getParameters(payoutRequest);

    const settings: FileSettings = new FileSettings({
      createdAt: new Date(),
      fileType: ReturnFileType.PDF,
      language: Language.ENGLISH,
      name: '',
      stationery: 'BAC',
    });

    const data: IPayoutRouteParams = {
      params,
      settings,
    };

    return new PayoutRouteParams(data);
  }

  /**
   * Generates a PDF for a payout request and uploads it to the file service.
   * If the payout request PDF generation or upload fails, it throws an error with the failure reason.
   * @param payoutRequestId - The ID of the payout request to generate and upload the PDF for.
   * @returns {Promise<PayoutRequestPdf>} A promise that resolves to the `PayoutRequestPdf` entity representing the generated and uploaded PDF.
   */
  public static async createPdf(payoutRequestId: number): Promise<PayoutRequestPdf> {
    const payoutRequest = await PayoutRequest.findOne({
      where: { id: payoutRequestId },
      relations: ['requestedBy', 'approvedBy', 'payoutRequestStatus'],
    });
    if (!payoutRequest) return undefined;

    const params = this.getPdfParams(payoutRequest);
    try {
      const res: FileResponse = await this.pdfGenerator.client.generatePayout(params);
      const blob = res.data;
      const buffer = Buffer.from(await blob.arrayBuffer());
      return await this.pdfGenerator.fileService.uploadPdf(payoutRequest, PayoutRequestPdf, buffer, payoutRequest.requestedBy);
    } catch (error) {
      throw new Error(`PayoutRequest generation failed for ${JSON.stringify(error, null, 2)}`);
    }
  }
}
