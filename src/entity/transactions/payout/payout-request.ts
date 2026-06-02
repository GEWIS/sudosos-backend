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
 * A `payout-request` is a user-initiated withdrawal: a member with a positive
 * {@link balance!Balance | Balance} asks for the money to be sent to a real bank account.
 * In practice this is mostly the exit hatch for members leaving the association who want
 * their leftover credit back; active members tend to just keep spending it.
 *
 * ### Two-phase commit
 * Creating a payout request does not move money. `POST /payoutrequests` saves a
 * {@link PayoutRequest} with status {@link PayoutRequestState.CREATED | CREATED}; the
 * member is on the hook for nothing yet.
 *
 * Money moves only when a treasurer approves it. `POST /payoutrequests/{id}/status` with
 * `state = APPROVED` runs
 * {@link PayoutRequestService.updateStatus | updateStatus}, which creates a debit
 * {@link transfers!Transfer | Transfer} (`from = requestedBy`, `to = null` because the
 * money leaves SudoSOS) and stamps `approvedBy`.
 *
 * ### State machine
 * Statuses live on the related {@link PayoutRequestStatus} table as an append-only history,
 * not as a single column. {@link PayoutRequestState} has four values and one start state:
 *
 * - {@link PayoutRequestState.CREATED | CREATED} is set on creation.
 * - {@link PayoutRequestState.APPROVED | APPROVED} is terminal and creates the transfer.
 *   Mutually exclusive with `DENIED` and `CANCELLED`.
 * - {@link PayoutRequestState.DENIED | DENIED} is terminal. The treasurer rejected the
 *   request, so no transfer is written.
 * - {@link PayoutRequestState.CANCELLED | CANCELLED} is terminal. The requester pulled it
 *   back, so no transfer is written.
 *
 * {@link PayoutRequestService.canUpdateStatus | canUpdateStatus} guards the transitions:
 * any of the three terminal states locks out the other two, and a state cannot be applied
 * twice.
 *
 * ### Bank details on the entity
 * Unlike most money movement in SudoSOS, the destination here is outside the system, so
 * `bankAccountNumber` and `bankAccountName` are columns on `PayoutRequest` itself. They
 * are captured at request time and frozen, since editing them after approval would
 * desync the printed PDF.
 *
 * ### Listing and PDFs
 * `GET /payoutrequests` paginates with filters (status, requestedBy, date range);
 * `GET /payoutrequests/{id}` returns the full status history. `PayoutRequest` extends
 * `PdfAble`, so `GET /payoutrequests/{id}/pdf` produces the treasurer's printable receipt
 * with the bank details on it.
 *
 * ### Versus seller-payouts
 * Both modules share `BasePayout` (`requestedBy`, `amount`, `transfer`) and both debit a
 * single user, but they answer different questions. A payout-request is one member
 * asking for their own credit back, gated on treasurer approval. A
 * {@link seller-payouts!SellerPayout | SellerPayout} is the treasurer settling sales
 * credit to an organ for a closed time window, with no approval step and an amount
 * derived from a sales report rather than declared by the user.
 *
 * @module payout-requests
 * @mergeTarget
 */

import {
  Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne,
} from 'typeorm';
import User from '../../user/user';
// eslint-disable-next-line import/no-cycle
import PayoutRequestStatus from './payout-request-status';
import PayoutRequestPdf from '../../file/payout-request-pdf';
import BasePayout from './base-payout';
import { PdfAble } from '../../file/pdf-able';
import PayoutRequestPdfService from '../../../service/pdf/payout-request-pdf-service';
import { PAYOUT_REQUEST_PDF_LOCATION } from '../../../files/storage';

@Entity()
export default class PayoutRequest extends PdfAble(BasePayout) {

  @OneToMany(() => PayoutRequestStatus, (status) => status.payoutRequest, { cascade: true })
  public payoutRequestStatus: PayoutRequestStatus[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  public approvedBy?: User;

  @Column()
  public bankAccountNumber: string;

  @Column()
  public bankAccountName: string;

  @Column({ nullable: true })
  public pdfId?: number;

  @OneToOne(() => PayoutRequestPdf, { eager: true, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public pdf?: PayoutRequestPdf;

  pdfService = new PayoutRequestPdfService(PAYOUT_REQUEST_PDF_LOCATION);
}
