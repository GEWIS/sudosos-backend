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
 * This is the page of stripe-settlement-report-pdf-service.
 *
 * @module internal/pdf/stripe-settlement-report-pdf-service
 */

import { HtmlUnstoredPdfService } from './pdf-service';
import { StripeSettlementReport } from '../../entity/report/stripe-settlement-report';
import { createStripeSettlementReportPdf, IStripeSettlementReportPdf } from '../../html/stripe-settlement-report.html';
import Config from '../../config';

export default class StripeSettlementReportPdfService extends HtmlUnstoredPdfService<StripeSettlementReport, IStripeSettlementReportPdf> {

  htmlGenerator = createStripeSettlementReportPdf;

  async getParameters(entity: StripeSettlementReport): Promise<IStripeSettlementReportPdf> {
    return {
      fromDate: entity.fromDate.toLocaleDateString('nl-NL'),
      toDate: entity.toDate.toLocaleDateString('nl-NL'),
      depositCount: entity.depositCount,
      depositTotalAmount: entity.depositTotalAmount.toFormat(),
      terminalPaymentCount: entity.terminalPaymentCount,
      terminalPaymentTotalAmount: entity.terminalPaymentTotalAmount.toFormat(),
      totalCount: entity.totalCount,
      totalAmount: entity.totalAmount.toFormat(),
      serviceEmail: Config.get().mail.financialResponsible || '',
    };
  }
}
