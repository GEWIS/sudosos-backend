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
  Column, Entity, JoinColumn, ManyToOne,
} from 'typeorm';
// eslint-disable-next-line import/no-cycle
import Invoice from './invoice';
import User from '../user/user';
import BaseEntity from '../base-entity';

export enum InvoiceState {
  CREATED = 1,
  SENT = 2,
  PAID = 3,
  DELETED = 4,
}

/**
 * @typedef {BaseEntity} InvoiceStatus
 * @property {Invoice.model} invoice.required - The invoice to which this state belongs.
 * @property {User.model} changedBy.required - The user that changed the invoice status.
 * @property {enum} state.required - The state of the Invoice
 */
@Entity()
export default class InvoiceStatus extends BaseEntity {
  @ManyToOne(() => Invoice, (invoice) => invoice.invoiceStatus, { nullable: false })
  @JoinColumn()
  public invoice: Invoice;

  @ManyToOne(() => User, { nullable: false, eager: true })
  public changedBy: User;

  @Column()
  public state: InvoiceState;
}
