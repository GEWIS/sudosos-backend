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
 * A `product` is a sellable item in SudoSOS — a beer, a snack, a ticket, a service charge.
 * Products are the lowest-level unit the rest of the system is built on: every purchase is a
 * line on a transaction that points at a specific {@link ProductRevision}.
 *
 * ### Owner vs. seller
 * A product has an `owner`, but this is just the user who created/curates the record. The
 * money for a sale does **not** go to the product owner — it goes to the
 * {@link catalogue/containers!Container | Container} owner (the seller). A single product
 * can appear in multiple containers and therefore be sold on behalf of different organs.
 *
 * ### Revisions
 * `Product` is paired with {@link ProductRevision}. Each edit (name, price, VAT group,
 * category, alcohol percentage, flags) produces a new revision; `currentRevision` points at
 * the live one. Past transactions keep referencing the revision that was in effect at the
 * time, so price, tax and category history stays intact. {@link ProductRevision} is
 * immutable — attempting to update one throws.
 *
 * Products are soft-deleted via `deletedAt`; the rows remain so that historical
 * {@link transactions/sub-transactions!SubTransaction | SubTransaction} references stay valid.
 *
 * ### Price and VAT
 * Each revision stores its price *including VAT* as a Dinero amount, plus a reference to the
 * {@link catalogue/vat!VatGroup | VatGroup} that determines the VAT rate. The response layer
 * exposes both `priceInclVat` and `priceExclVat`.
 *
 * ### Display flags
 * Three booleans on `ProductRevision` control how the POS and narrowcasting treat a product:
 * - `featured` — should be highlighted in the POS UI.
 * - `preferred` — should bubble to the top of the POS product list.
 * - `priceList` — should appear on narrowcasting (price list) screens.
 *
 * Display order within a specific POS is independent and is stored via
 * {@link catalogue/point-of-sale!ProductOrdering | ProductOrdering}.
 *
 * ### Image
 * An optional {@link ProductImage} record points at the image file on disk. Deleting a
 * product does not cascade to the image — images must be removed from storage explicitly.
 *
 * ### Category
 * Every revision belongs to exactly one
 * {@link catalogue/product-categories!ProductCategory | ProductCategory}, which is what
 * reports group revenue by.
 *
 * For API interactions, refer to the [Swagger Documentation](https://sudosos.gewis.nl/api/api-docs/#/products).
 *
 * @module catalogue/products
 * @mergeTarget
 */

import {
  Column, DeleteDateColumn,
  Entity, JoinColumn,
  ManyToOne, OneToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import ProductImage from '../file/product-image';

/**
 * TypeORM entity for the `products` table.
 * @typedef {BaseEntity} Product
 * @property {integer} currentRevision - The current revision of the product.
 * Can be null if no revision exists.
 * @property {User.model} owner.required - The owner of the product.
 * @property {ProductImage.model} image - The image of the product.
 */
@Entity()
export default class Product extends BaseEntity {
  @Column({
    nullable: true,
  })
  public currentRevision: number;

  @DeleteDateColumn()
  public readonly deletedAt: Date | null;

  @ManyToOne(() => User, { nullable: false, eager: true })
  public owner: User;

  // onDelete: 'CASCADE' is not possible here, because removing the
  // image from the database will not remove it form storage
  @OneToOne(() => ProductImage, { nullable: true, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public image?: ProductImage;
}
