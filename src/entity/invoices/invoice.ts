/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
  Column,
  Entity, JoinColumn, ManyToOne, OneToMany, OneToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import Transfer from '../transactions/transfer';
// eslint-disable-next-line import/no-cycle
import InvoiceEntry from './invoice-entry';
// eslint-disable-next-line import/no-cycle
import InvoiceStatus from './invoice-status';

/**
 * @typedef {BaseEntity} Invoice
 * @property {User.model} to.required - The account for whom the invoice is
 * @property {Transfer.model} transfer.required - The transfer entity representing the invoice.
 * @property {Array<InvoiceEntry>} invoiceEntries.required - The entries describing this invoice.
 * @property {Array<invoiceStatus>} invoiceStatus.required - The status history of the invoice
 * @property {string} addressee.required - Name of the addressed
 * @property {string} description.required - The description of the invoice
 */
@Entity()
export default class Invoice extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  public to: User;

  @OneToOne(() => Transfer, {
    nullable: false,
  })
  @JoinColumn()
  public transfer: Transfer;

  @OneToMany(() => InvoiceEntry,
    (invoiceEntry) => invoiceEntry.invoice,
    { cascade: true })
  public invoiceEntries: InvoiceEntry[];

  @OneToMany(() => InvoiceStatus,
    (invoiceStatus) => invoiceStatus.state,
    { cascade: true })
  public invoiceStatus: InvoiceStatus[];

  @Column()
  public addressee: string;

  @Column()
  public description: string;
}
