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
import { Response } from 'express';
import ReportService from '../service/report-service';
import { ReturnFileType, UserReportParametersType } from 'pdf-generator-client';
import ReportPdfService from '../service/report-pdf-service';

export function reportPDFhelper(res: Response) {
  return async (service: ReportService, filters: { fromDate: Date, tillDate: Date }, description: string, forId: number, reportType: UserReportParametersType, fileType: ReturnFileType) => {
    const report = await service.getReport({ ...filters, forId });

    const pdf = await ReportPdfService.getReportPdf(report, description, reportType, fileType);
    const from = `${filters.fromDate.getFullYear()}${filters.fromDate.getMonth() + 1}${filters.fromDate.getDate()}`;
    const to = `${filters.tillDate.getFullYear()}${filters.tillDate.getMonth() + 1}${filters.tillDate.getDate()}`;
    const fileName = `${reportType}-${from}-${to}.${fileType}`;

    res.setHeader('Content-Type', `application/${fileType}`);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdf);
  };
}
