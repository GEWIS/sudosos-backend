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
 * A `write-off` zeroes an unrecoverable negative {@link balance!Balance | Balance} and
 * closes the account it belongs to. Treasurers use it for users who have left the
 * association without settling up: rather than letting a stale debt sit on the books, the
 * write-off cancels it out in one credit transfer and the account is retired.
 *
 * ### Lifecycle
 * `POST /writeoffs` is the only way to create one. The handler refuses if the user has a
 * non-negative balance, then
 * {@link WriteOffService.createWriteOffAndCloseUser | createWriteOffAndCloseUser} runs:
 *
 * - A {@link WriteOff} is saved with `amount = -balance` (always positive) and `to`
 *   pointing at the doomed account.
 * - A credit {@link transfers!Transfer | Transfer} is created with `from = null` and
 *   `to = user`, tagged with the server's high {@link catalogue/vat!VatGroup | VatGroup} so
 *   the consumed goods stay accounted for at the higher rate.
 * - {@link users!User | UserService.closeUser} marks the account closed and deleted.
 *
 * There is no `DELETE /writeoffs/{id}`. A write-off is final; reversing one requires a
 * manual transfer.
 *
 * ### VAT on the credit transfer
 * The write-off's credit transfer is tagged with the server's high
 * {@link catalogue/vat!VatGroup | VatGroup}. The products the user consumed had VAT
 * charged at sale time, and the write-off cancels payment for those products, so the
 * VAT side of the books has to be accounted for too.
 *
 * ### Listing and PDFs
 * `GET /writeoffs` and `GET /writeoffs/{id}` page through past write-offs for treasurer
 * reconciliation. `GET /writeoffs/{id}/pdf` renders the receipt; `WriteOff` extends
 * `PdfAble` and the PDF is regenerated on demand and cached as a {@link WriteOffPdf}
 * relation.
 *
 * @module write-offs
 * @mergeTarget
 */

import {
  Column, Entity, JoinColumn, ManyToOne, OneToOne,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import BaseEntity from '../base-entity';
import User from '../user/user';
import DineroTransformer from '../transformer/dinero-transformer';
// eslint-disable-next-line import/no-cycle
import Transfer from '../transactions/transfer';
import { PdfAble } from '../file/pdf-able';
import { WRITE_OFF_PDF_LOCATION } from '../../files/storage';
import WriteOffPdfService from '../../service/pdf/write-off-pdf-service';
import WriteOffPdf from '../file/write-off-pdf';

@Entity()
export default class WriteOff extends PdfAble(BaseEntity) {
  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn()
  public to: User;

  @OneToOne(() => Transfer, { nullable: true })
  @JoinColumn()
  public transfer?: Transfer;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @Column({ nullable: true })
  public pdfId?: number;

  @OneToOne(() => WriteOffPdf, { eager: true, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public pdf?: WriteOffPdf;
  
  pdfService = new WriteOffPdfService(WRITE_OFF_PDF_LOCATION);

  async getOwner(): Promise<User> {
    return this.to;
  }
}
