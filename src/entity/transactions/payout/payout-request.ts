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
 * This is the module page of the payout-request.
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
