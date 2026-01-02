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
 * This is the module page of the write-off.
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
