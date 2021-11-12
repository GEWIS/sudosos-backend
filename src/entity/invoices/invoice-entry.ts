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
import { Dinero } from 'dinero.js';
// eslint-disable-next-line import/no-cycle
import DineroTransformer from '../transformer/dinero-transformer';
// eslint-disable-next-line import/no-cycle
import Invoice from './invoice';
import BaseEntity from '../base-entity';

/**
 * @typedef {BaseEntity} InvoiceEntry
 * @property {Invoice.model} invoice.required - The invoice to which this entry belongs
 * @property {Dinero.model} price.required - The price of the item.
 * @property {integer} amount.required - The amount of items in the invoice entry.
 * @property {string} description.required - The description of the invoice entry item.
 */
@Entity()
export default class InvoiceEntry extends BaseEntity {
  @ManyToOne(() => Invoice, (invoice) => invoice.invoiceEntries, { nullable: false })
  @JoinColumn()
  public invoice: Invoice;

  @Column()
  public description: string;

  @Column({
    type: 'integer',
  })
  public amount: number;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public price: Dinero;
}
