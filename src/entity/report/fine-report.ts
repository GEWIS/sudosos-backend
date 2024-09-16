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

import { Dinero } from 'dinero.js';
import { UnstoredPdfAble } from '../file/pdf-able';
import FineReportPdfService from '../../service/pdf/report-pdf-service';
import { FineReportResponse } from '../../controller/response/debtor-response';

class IFineReport {
  fromDate: Date;

  toDate: Date;

  count: number;

  handedOut: Dinero;

  waivedCount: number;

  waivedAmount: Dinero;

  constructor(init?: Partial<IFineReport>) {
    Object.assign(this, init);
  }
}

export class FineReport extends UnstoredPdfAble(IFineReport) {
  pdfService = new FineReportPdfService();

  toResponse(): FineReportResponse {
    return {
      fromDate: this.fromDate.toISOString(),
      toDate: this.toDate.toISOString(),
      count: this.count,
      handedOut: this.handedOut.toObject(),
      waivedCount: this.waivedCount,
      waived: this.waivedAmount.toObject(),
    };
  }
}
