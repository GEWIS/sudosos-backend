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
 * This is the module page of the stripe-settlement-report.
 *
 * @module reports
 */

import { Dinero } from 'dinero.js';
import { UnstoredPdfAble } from '../file/pdf-able';
import StripeSettlementReportPdfService from '../../service/pdf/stripe-settlement-report-pdf-service';
import { StripeSettlementReportResponse } from '../../controller/response/stripe-response';

class IStripeSettlementReport {
  fromDate: Date;

  toDate: Date;

  depositCount: number;

  depositTotalAmount: Dinero;

  terminalPaymentCount: number;

  terminalPaymentTotalAmount: Dinero;

  totalCount: number;

  totalAmount: Dinero;

  constructor(init?: Partial<IStripeSettlementReport>) {
    Object.assign(this, init);
  }
}

/**
 * Totals-only report of everything that settled through Stripe over a date
 * range -- deposits (online top-ups) and terminal payments -- so treasurers
 * can cross-reference the gross amount against a Stripe payout.
 *
 * Deliberately excludes payments settled via a shareable payment link
 * (PaymentRequest): those also move money through the same Stripe account,
 * but do not go through a StripeDeposit record, so a GEWIS that uses that
 * feature will still see this report undercount against a real payout.
 */
export class StripeSettlementReport extends UnstoredPdfAble(IStripeSettlementReport) {
  pdfService = new StripeSettlementReportPdfService();

  toResponse(): StripeSettlementReportResponse {
    return {
      fromDate: this.fromDate.toISOString(),
      toDate: this.toDate.toISOString(),
      deposits: {
        count: this.depositCount,
        totalAmount: this.depositTotalAmount.toObject(),
      },
      terminalPayments: {
        count: this.terminalPaymentCount,
        totalAmount: this.terminalPaymentTotalAmount.toObject(),
      },
      total: {
        count: this.totalCount,
        totalAmount: this.totalAmount.toObject(),
      },
    };
  }
}
