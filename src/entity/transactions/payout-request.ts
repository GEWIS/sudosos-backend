/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
 */

import {
  Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import BaseEntity from '../base-entity';
import User from '../user/user';
import Transfer from './transfer';
import DineroTransformer from '../transformer/dinero-transformer';
// eslint-disable-next-line import/no-cycle
import PayoutRequestStatus from './payout-request-status';
import PayoutRequestPdf from '../file/payout-request-pdf';
import { hashJSON } from '../../helpers/hash';
import PayoutRequestPdfService from '../../service/payout-request-pdf-service';

@Entity()
// TODO Migration
export default class PayoutRequest extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn()
  public requestedBy: User;

  @OneToOne(() => Transfer, { nullable: true })
  @JoinColumn()
  public transfer?: Transfer;

  @OneToMany(() => PayoutRequestStatus, (status) => status.payoutRequest, { cascade: true })
  public payoutRequestStatus: PayoutRequestStatus[];

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amount: Dinero;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  public approvedBy?: User;

  @Column()
  public bankAccountNumber: string;

  @Column()
  public bankAccountName: string;

  @Column({ nullable: true })
  public pdfId?: number;

  @OneToOne(() => PayoutRequestPdf, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public pdf?: PayoutRequestPdf;

  getPdfParamHash(): string {
    return hashJSON(PayoutRequestPdfService.getParameters(this));
  }

  createPDF(): Promise<PayoutRequestPdf> {
    return PayoutRequestPdfService.createPdf(this.id);
  }
}
