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
 * This is the page of fine-report-pdf-service.
 *
 * @module internal/pdf/fine-report-pdf-service
 */

import { HtmlUnstoredPdfService } from './pdf-service';
import { FineReport } from '../../entity/report/fine-report';
import { createFineReportPdf, IFineReportPdf } from '../../html/fine-report.html';
import { PDF_VAT_HIGH } from '../../helpers/pdf';
import Config from '../../config';
import DineroTransformer from '../../entity/transformer/dinero-transformer';

export default class FineReportPdfService extends HtmlUnstoredPdfService<FineReport, IFineReportPdf> {

  htmlGenerator = createFineReportPdf;

  async getParameters(entity: FineReport): Promise<IFineReportPdf> {
    const inclVat = entity.handedOut.getAmount() - entity.waivedAmount.getAmount();
    const exclVat = Math.round(inclVat / (1 + (PDF_VAT_HIGH / 100)));
    const vat = inclVat - exclVat;

    return {
      fromDate: entity.fromDate.toLocaleDateString('nl-NL'),
      toDate: entity.toDate.toLocaleDateString('nl-NL'),
      count: entity.count,
      handedOut: entity.handedOut.toFormat(),
      waivedCount: entity.waivedCount,
      waivedAmount: entity.waivedAmount.toFormat(),
      totalExclVat: DineroTransformer.Instance.from(exclVat).toFormat(),
      vatAmount: DineroTransformer.Instance.from(vat).toFormat(),
      vatPercentage: PDF_VAT_HIGH,
      totalInclVat: DineroTransformer.Instance.from(inclVat).toFormat(),
      serviceEmail: Config.get().mail.financialResponsible || '',
    };
  }
}
