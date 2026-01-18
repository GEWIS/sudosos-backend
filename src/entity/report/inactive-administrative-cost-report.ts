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
 * This is the module page of the inactive-administrative-cost-report.
 *
 * @module reports
 */

import { Dinero } from 'dinero.js';
import { UnstoredPdfAble } from '../file/pdf-able';
import InactiveAdministrativeCostReportPdfService from '../../service/pdf/inactive-administrative-cost-report-pdf-service';
import { InactiveAdministrativeCostReportResponse } from '../../controller/response/inactive-administrative-cost-response';

class IInactiveAdministrativeCostReport {
  fromDate: Date;

  toDate: Date;

  totalAmountInclVat: Dinero;

  totalAmountExclVat: Dinero;

  vatAmount: Dinero;

  vatPercentage: number;

  count: number;

  constructor(init?: Partial<IInactiveAdministrativeCostReport>) {
    Object.assign(this, init);
  }
}

export class InactiveAdministrativeCostReport extends UnstoredPdfAble(IInactiveAdministrativeCostReport) {
  pdfService = new InactiveAdministrativeCostReportPdfService();

  toResponse(): InactiveAdministrativeCostReportResponse {
    return {
      fromDate: this.fromDate.toISOString(),
      toDate: this.toDate.toISOString(),
      totalAmountInclVat: this.totalAmountInclVat.toObject(),
      totalAmountExclVat: this.totalAmountExclVat.toObject(),
      vatAmount: this.vatAmount.toObject(),
      vatPercentage: this.vatPercentage,
      count: this.count,
    };
  }
}
