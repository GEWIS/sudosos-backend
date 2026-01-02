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
 * This is the module page of the product-ordering.
 *
 * @module catalogue/point-of-sale
 */

import {
  Column,
  Entity, JoinColumn,
  ManyToOne, PrimaryColumn,
  Unique,
} from 'typeorm';
import Product from '../product/product';
import PointOfSale from './point-of-sale';

/**
 * @typedef ProductOrdering
 * @property {PointOfSale.model} pos.required - The pointOfSale the ordering belongs to.
 * @property {Product.model} product.required - The product that should be in the ordering.
 * @property {integer} order.required - The order number of the product in the pointOfSale.
 */
@Entity()
@Unique(['pos', 'product', 'order'])
export default class ProductOrdering {
  @PrimaryColumn()
  public posId: number;

  @ManyToOne(() => PointOfSale)
  @JoinColumn({ name: 'posId' })
  public pos: PointOfSale;

  @PrimaryColumn()
  public productId: number;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  public product: Product;

  @Column()
  public order: number;
}
