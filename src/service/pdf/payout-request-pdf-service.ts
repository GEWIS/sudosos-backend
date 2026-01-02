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
 * This is the page of payout-request-pdf-service.
 *
 * @module internal/pdf/payout-request-pdf-service
 */

import { FileResponse, PayoutRouteParams } from 'pdf-generator-client';
import PayoutRequest from '../../entity/transactions/payout/payout-request';
import {
  PayoutParameters,
  Payout,
} from 'pdf-generator-client';
import PayoutRequestPdf from '../../entity/file/payout-request-pdf';
import { PdfService } from './pdf-service';

export default class PayoutRequestPdfService extends PdfService<PayoutRequestPdf, PayoutRequest, PayoutRouteParams> {

  pdfConstructor = PayoutRequestPdf;

  routeConstructor = PayoutRouteParams;

  generator(routeParams: PayoutRouteParams): Promise<FileResponse> {
    return this.client.generatePayout(routeParams);
  }

  async getParameters(entity: PayoutRequest): Promise<PayoutParameters> {
    return new PayoutParameters({
      payout: new Payout({
        bankAccountName: entity.bankAccountName,
        bankAccountNumber: entity.bankAccountNumber,
        amount: entity.amount.getAmount(),
        reference: `SDS-PR-${String(entity.id).padStart(4, '0')}`,
        date: entity.createdAt,
        debtorNumber: String(entity.requestedBy.id),
      }),
    });
  }
}
