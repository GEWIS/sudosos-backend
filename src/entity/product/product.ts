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
 * This is the module page of the product.
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
