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
/* eslint-disable import/no-cycle */
import {
  Entity, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import Product from './product';
import Transaction from './transaction';
import DineroTransformer from './transformer/dinero-transformer';
import BaseEntity from './base-entity';

/**
 * @typedef {BaseEntity} Subtransaction
 * @property {Product.model} product.required - The product sold in the subtransaction.
 * @property {integer} amount.required - The amount of product involved in this subtransaction.
 * @property {Dinero.model} price.required - The price of each product in this subtransaction.
 */
@Entity()
export default class Subtransaction extends BaseEntity {
  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'productId' })
  public product: Product;

  @Column({
    type: 'integer',
  })
  public amount: number;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public price: Dinero;

  @ManyToOne(() => Transaction, { nullable: false })
  @JoinColumn({ name: 'transaction' })
  public transaction: Transaction;
}
