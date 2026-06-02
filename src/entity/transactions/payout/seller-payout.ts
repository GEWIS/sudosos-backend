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
 * A `seller-payout` settles sales credit from SudoSOS to an organ. Every
 * {@link transactions/sub-transactions!SubTransactionRow | SubTransactionRow} that crosses
 * the till credits the container-owner's user account
 * ({@link users!UserType.ORGAN | ORGAN} users hold this credit). Once a quarter, or
 * whenever the organ asks for a settlement, a treasurer creates a seller-payout that
 * sweeps the accumulated credit back out to the real-world bank account.
 *
 * ### Snapshot at creation, not a live link
 * Each {@link SellerPayout} covers a `[startDate, endDate]` window of revenue. At creation
 * time {@link SellerPayoutService.createSellerPayout | createSellerPayout} asks
 * {@link internal/reports!SalesReportService | SalesReportService} for a report over that
 * window and copies `report.totalInclVat` onto the entity. From then on the amount is
 * frozen on both the payout and its linked {@link transfers!Transfer | Transfer}; the
 * payout does not re-query the report.
 *
 * That snapshot can drift from reality. If a sub-transaction inside the window is changed
 * or deleted after the payout exists (a refund, an admin correction), the snapshot and a
 * fresh report for the same window no longer agree. Detecting this is what
 * `GET /seller-payouts/{id}/report` is for: it re-runs the sales report with the payout's
 * stored window and `requestedBy`, so the treasurer can compare the live total against
 * `payout.amount`. `PATCH /seller-payouts/{id}` is the lever for reconciling once drift
 * is found.
 *
 * Overlapping windows for the same seller are still refused, so the same revenue cannot
 * be paid out twice. The refusal only checks date ranges though, not whether the prior
 * payout still matches its window.
 *
 * ### One transfer, no approval step
 * Unlike a {@link payout-requests!PayoutRequest | PayoutRequest}, a seller-payout has no
 * status state machine. It is treasurer-initiated and lands already-final. `POST
 * /seller-payouts` creates the {@link SellerPayout} and a single debit
 * {@link transfers!Transfer | Transfer} (`from = requestedBy`, the seller user;
 * `to = null`, since the money leaves SudoSOS) in one go. `requestedBy` on `BasePayout`
 * is the seller being paid out, despite the name carried over from payout-requests.
 *
 * ### Editing and deleting
 * `PATCH /seller-payouts/{id}` lets the treasurer adjust `amount` and `reference` after
 * creation, typically used to reconcile drift surfaced by the `/report` endpoint. The
 * linked transfer's `amountInclVat` is updated in lockstep.
 * `DELETE /seller-payouts/{id}` removes both the payout row and its transfer; this is an
 * admin escape hatch, not a regular user action.
 *
 * ### Inspecting the window
 * `GET /seller-payouts/{id}/report` returns the live sales report for the stored window
 * (see the drift note above). `GET /seller-payouts/{id}/report/pdf` is the printable
 * version. {@link SellerPayout} itself is `PdfAble` too:
 * `GET /seller-payouts/{id}/pdf` produces the payout receipt using the snapshotted
 * amount, with the period and the `reference` printed on it.
 *
 * @module seller-payouts
 * @mergeTarget
 */

import BasePayout from './base-payout';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import SellerPayoutPdf from '../../file/seller-payout-pdf';
import SellerPayoutPdfService from '../../../service/pdf/seller-payout-pdf-service';
import { PdfAble } from '../../file/pdf-able';
import { SELLER_PAYOUT_PDF_LOCATION } from '../../../files/storage';

@Entity()
export default class SellerPayout extends PdfAble(BasePayout) {
  @Column({ type: 'datetime', nullable: false })
  public startDate: Date;

  @Column({ type: 'datetime', nullable: false })
  public endDate: Date;

  @Column({ nullable: false })
  public reference: string;

  @Column({ nullable: true })
  public pdfId?: number;

  @OneToOne(() => SellerPayoutPdf, { eager: true, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public pdf?: SellerPayoutPdf;

  pdfService = new SellerPayoutPdfService(SELLER_PAYOUT_PDF_LOCATION);
}
