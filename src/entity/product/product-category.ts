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

/**
 * This is the module page of the product-category.
 *
 * @module inventory/product-categories
 * @mergeTarget
 */

import {
  Entity, Column, Tree, TreeChildren, TreeParent,
} from 'typeorm';
import BaseEntity from '../base-entity';

/**
 * @typedef {BaseEntity} ProductCategory
 * @property {string} name.required - The unique name of the productCategory.
 */
@Entity()
@Tree('closure-table')
export default class ProductCategory extends BaseEntity {
  @Column({
    unique: true,
    length: 64,
    nullable: false,
  })
  public name: string;

  @TreeChildren()
  public children: ProductCategory[];

  @TreeParent()
  public parent: ProductCategory;
}
