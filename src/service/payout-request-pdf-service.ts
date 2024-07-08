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
import BaseFile from '../entity/file/base-file';
import FileService from './file-service';
import { PAYOUT_REQUEST_PDF_LOCATION } from '../files/storage';
import {PdfGenerator} from "../entity/file/pdf-file";

const PDF_GEN_URL =  process.env.PDF_GEN_URL ? process.env.PDF_GEN_URL : 'http://localhost:3001/pdf';

export default class PayoutRequestPdfService {

  static pdfGenerator: PdfGenerator = {
    client: new Client(PDF_GEN_URL, { fetch }),
    fileService: new FileService(PAYOUT_REQUEST_PDF_LOCATION),
  };

  public static async createPayoutRequestPDF(payoutRequestId: number): Promise<BaseFile> {
    const payoutRequest = await PayoutRequest.findOne({
      where: { id: payoutRequestId },
      relations: ['requestedBy', 'approvedBy', 'payoutRequestStatus'],
    });
    if (!payoutRequest) return undefined;

    const params = this.getPdfParams(payoutRequest);
    return this.pdfGenerator.client.generatePayoutRequest(params).then(async (res: FileResponse) => {
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    }).catch((res: any) => {
      throw new Error(`PayoutRequest generation failed for ${JSON.stringify(res, null, 2)}`);
    });
  }
}
