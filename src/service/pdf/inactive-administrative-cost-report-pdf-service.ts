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
 * This is the page of inactive-administrative-cost-report-pdf-service.
 *
 * @module internal/pdf/inactive-administrative-cost-report-pdf-service
 */

import { HtmlUnstoredPdfService } from './pdf-service';
import { InactiveAdministrativeCostReport } from '../../entity/report/inactive-administrative-cost-report';
import { createInactiveAdministrativeCostReportPdf, IInactiveAdministrativeCostReportPdf } from '../../html/inactive-administrative-cost-report.html';

export default class InactiveAdministrativeCostReportPdfService extends HtmlUnstoredPdfService<InactiveAdministrativeCostReport, IInactiveAdministrativeCostReportPdf> {

  htmlGenerator = createInactiveAdministrativeCostReportPdf;

  async getParameters(entity: InactiveAdministrativeCostReport): Promise<IInactiveAdministrativeCostReportPdf> {
    return {
      fromDate: entity.fromDate.toLocaleDateString('nl-NL'),
      toDate: entity.toDate.toLocaleDateString('nl-NL'),
      totalAmountInclVat: entity.totalAmountInclVat.toFormat(),
      totalAmountExclVat: entity.totalAmountExclVat.toFormat(),
      vatAmount: entity.vatAmount.toFormat(),
      vatPercentage: entity.vatPercentage,
      count: entity.count,
      serviceEmail: process.env.FINANCIAL_RESPONSIBLE || '',
    };
  }
}
