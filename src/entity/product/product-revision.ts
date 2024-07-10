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
  BeforeUpdate,
  Column,
  Entity, JoinColumn, ManyToMany,
  ManyToOne, PrimaryColumn,
} from 'typeorm';
import Product from './product';
import DineroTransformer from '../transformer/dinero-transformer';
import { Dinero } from 'dinero.js';
import VatGroup from '../vat-group';
import ProductCategory from './product-category';
import BaseEntityWithoutId from '../base-entity-without-id';
import ContainerRevision from '../container/container-revision';

/**
 * @typedef {BaseEntityWithoutId} ProductRevision
 * @property {Product.model} product.required - The product the revision belongs to.
 * @property {integer} revision.required - The revision number of this revision.
 * @property {string} name.required - The unique name of the product.
 * @property {Dinero.model} price.required - The price of each product.
 * @property {boolean} featured - If product should be highlighted in POS.
 * @property {boolean} preferred - If product should be on top in POS.
 * @property {boolean} priceList - If shown of narrowcasting screens.
 */
@Entity()
export default class ProductRevision extends BaseEntityWithoutId {
  @PrimaryColumn()
  public readonly productId: number;

  @ManyToOne(() => Product, {
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  public readonly product: Product;

  @Column({
    primary: true,
    default: 1,
    nullable: false,
  })
  public revision: number;

  @Column({
    length: 64,
  })
  public name: string;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public priceInclVat: Dinero;

  @ManyToOne(() => VatGroup, { nullable: false })
  public vat: VatGroup;

  @ManyToOne(() => ProductCategory, { nullable: false })
  public category: ProductCategory;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  public alcoholPercentage: number;

  /**
   * Whether this product should be highlighted in the POS
   */
  @Column({
    default: false,
  })
  public featured: boolean;

  /**
   * Whether this product should be on top in the POS
   */
  @Column({
    default: false,
  })
  public  preferred: boolean;

  /**
   * If shown of narrowcasting screens
   */
  @Column({
    default: false,
  })
  public  priceList: boolean;

  @ManyToMany(() => ContainerRevision, (container) => container.products)
  public containers: ContainerRevision[];

  @BeforeUpdate()
  // eslint-disable-next-line class-methods-use-this
  denyUpdate() {
    throw new Error('Immutable entities cannot be updated.');
  }
}
