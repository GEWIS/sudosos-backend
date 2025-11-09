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

/**
 * This is the module page of the express-pdf.
 *
 * @module helpers
 */

import { Response } from 'express';
import { ReturnFileType, UserReportParametersType } from 'pdf-generator-client';
import { BuyerReportService, SalesReportService } from '../service/report-service';

type PdfAbleService = SalesReportService | BuyerReportService;

export function reportPDFhelper(res: Response) {
  return async (service: PdfAbleService, filters: { fromDate: Date, tillDate: Date }, description: string, forId: number, reportType: UserReportParametersType, fileType: ReturnFileType) => {
    const report = await service.getReport({ ...filters, forId });

    const buffer = fileType === 'PDF' ? await report.createPdf() : await report.createRaw();
    const from = `${filters.fromDate.getFullYear()}${filters.fromDate.getMonth() + 1}${filters.fromDate.getDate()}`;
    const to = `${filters.tillDate.getFullYear()}${filters.tillDate.getMonth() + 1}${filters.tillDate.getDate()}`;
    const fileName = `${reportType}-${from}-${to}.${fileType}`;

    res.setHeader('Content-Type', `application/${fileType}`);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  };
}
