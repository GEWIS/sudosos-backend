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
 *
 *  @license
 */

import {
  Column, Entity, JoinColumn, ManyToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
// eslint-disable-next-line import/no-cycle
import SubTransaction from './sub-transaction';
import ProductRevision from '../product/product-revision';
import Invoice from '../invoices/invoice';

/**
 * @typedef {BaseEntity} SubTransactionRow
 * @property {Product.model} product.required - The product that has been bought.
 * @property {integer} amount.required - The amount that has been bought.
 * @property {SubTransaction.model} subTransaction - The subTransaction this row belongs to.
 */
@Entity()
export default class SubTransactionRow extends BaseEntity {
  @ManyToOne(() => ProductRevision, { nullable: false })
  public product: ProductRevision;

  @Column({
    type: 'integer',
  })
  public amount: number;

  @Column({ type: 'integer', nullable: true })
  public invoiceId?: number;

  @ManyToOne(() => Invoice, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public invoice?: Invoice;

  @ManyToOne(() => SubTransaction,
    (subTransaction) => subTransaction.subTransactionRows,
    { nullable: false, onDelete: 'CASCADE' })
  public subTransaction: SubTransaction;
}
