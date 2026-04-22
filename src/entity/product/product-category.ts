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
 * `Product categories` classify products taxonomically — e.g. "Beer", "Soda", "Snacks".
 * Every {@link catalogue/products!ProductRevision | ProductRevision} belongs to exactly one
 * category, so a product's category is part of its revision history and can change when the
 * product is edited.
 *
 * ### Hierarchy
 * Categories form a tree: each category may have a `parent`, and root categories have
 * `parent: null`. This lets a broad category like "Drinks" contain narrower children like
 * "Beer" and "Non-Alcoholic". The tree is stored as a TypeORM `closure-table` so descendants
 * at any depth stay queryable.
 *
 * ### Usage
 * - Reports group revenue and purchases by category, so categorisation drives financial
 *   breakdowns (see {@link internal/reports!ReportService | ReportService}).
 * - Category `name` is unique and capped at 64 characters.
 *
 * Unlike containers and points of sale, `ProductCategory` is **not revisioned** — the category
 * table itself is mutable. Historical transactions reference the category indirectly, via the
 * {@link catalogue/products!ProductRevision | ProductRevision} that was in effect at the time.
 *
 * For API interactions, refer to the [Swagger Documentation](https://sudosos.gewis.nl/api/api-docs/#/productCategories).
 *
 * @module catalogue/product-categories
 * @mergeTarget
 */

import {
  Entity, Column, Tree, TreeChildren, TreeParent,
} from 'typeorm';
import BaseEntity from '../base-entity';

/**
 * TypeORM entity for the `product_categories` table.
 * Stored as a closure-table tree via TypeORM's `@Tree`, so each row may have a parent and
 * descendants at any depth remain queryable.
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
