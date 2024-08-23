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
import BasePayout from './base-payout';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import PayoutRequestPdf from '../../file/payout-request-pdf';
import { hashJSON } from '../../../helpers/hash';
import SellerPayoutPdf from '../../file/seller-payout-pdf';
import SellerPayoutPdfService from '../../../service/seller-payout-pdf-service';

@Entity()
export default class SellerPayout extends BasePayout {
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

  async getPdfParamHash(): Promise<string> {
    return hashJSON(await SellerPayoutPdfService.getParameters(this));
  }

  async createPDF(): Promise<PayoutRequestPdf> {
    return SellerPayoutPdfService.createPdf(this.id);
  }
}
