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
  ManyToOne,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import DineroTransformer from '../transformer/dinero-transformer';
import BaseEntityWithoutId from '../base-entity-without-id';
import ProductCategory from './product-category';
import VatGroup from '../vat-group';

/**
 * @typedef {BaseEntityWithoutId} BaseProduct
 * @property {string} name.required - The unique name of the product.
 * @property {Dinero} price.required - The price of each product.
 */
export default class BaseProduct extends BaseEntityWithoutId {
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
    scale: 2,
  })
  public alcoholPercentage: number;
}
