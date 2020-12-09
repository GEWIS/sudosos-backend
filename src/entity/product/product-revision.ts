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
  Column, Entity, ManyToOne, SaveOptions,
} from 'typeorm';
import BaseProduct from './base-product';
import Product from './product';

@Entity()
export default class ProductRevision extends BaseProduct {
  @ManyToOne(() => Product, {
    primary: true,
    nullable: false,
    eager: true,
  })
  public readonly product: Product;

  @Column({
    primary: true,
    default: 1,
    nullable: false,
  })
  public revision: number;

  /**
   * Saving revisions should always occur using the save() method,
   * using the Repository does not automatically increment the version number.
   *
   * @inheritdoc
   */
  public async save(options?: SaveOptions): Promise<this> {
    this.revision += 1;
    return super.save(options);
  }
}
