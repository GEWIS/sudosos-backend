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
 * This is the page of report-pdf-service.
 *
 * @module internal/pdf/report-pdf-service
 */

import {
  FileResponse,
  FineReportParameters,
  FineRouteParams, Product,
  ProductPricing,
  TotalPricing,
  VAT,
} from 'pdf-generator-client';
import {
  PDF_VAT_HIGH,
  UNUSED_NUMBER,
  UNUSED_PARAM,
} from '../../helpers/pdf';
import { UnstoredPdfService } from './pdf-service';
import { FineReport } from '../../entity/report/fine-report';

const HANDED_OUT_FINES = 'Handed out';
const WAIVED_FINES = 'Waived';

export default class FineReportPdfService extends UnstoredPdfService<FineReport, FineRouteParams> {
  routeConstructor = FineRouteParams;

  generator(routeParams: FineRouteParams): Promise<FileResponse> {
    return this.client.generateFineReport(routeParams);
  }

  async getParameters(entity: FineReport): Promise<FineReportParameters> {
    const handedOut =  new Product({
      name: HANDED_OUT_FINES,
      summary: UNUSED_PARAM,
      pricing: new ProductPricing({
        basePrice: entity.handedOut.getAmount(),
        vatAmount: PDF_VAT_HIGH,
        // is actually unused
        vatCategory: VAT.ZERO,
        quantity: entity.count,
      }),
    });
    const fines = [handedOut];
    if (entity.waivedCount > 0) {
      const waived = new Product({
        name: WAIVED_FINES,
        summary: UNUSED_PARAM,
        pricing: new ProductPricing({
          basePrice: entity.waivedAmount.getAmount() * -1,
          vatAmount: PDF_VAT_HIGH,
          // is actually unused
          vatCategory: VAT.ZERO,
          quantity: entity.waivedCount,
        }),
      });
      fines.push(waived);
    }
    const inclVat = entity.handedOut.getAmount() - entity.waivedAmount.getAmount();
    const exclVat =  Math.round(inclVat  / (1 + (PDF_VAT_HIGH / 100)));
    const highVat = inclVat - exclVat;

    const total = new TotalPricing({
      exclVat,
      lowVat: UNUSED_NUMBER,
      highVat,
      inclVat,
    });

    return new FineReportParameters({
      startDate: entity.fromDate,
      endDate: entity.toDate,
      fines,
      total,
    });
  }
}
