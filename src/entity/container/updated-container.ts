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
  Entity,
  JoinColumn, JoinTable, ManyToMany,
  OneToOne, PrimaryColumn,
} from 'typeorm';
import BaseContainer from './base-container';
import Container from './container';
import Product from '../product/product';

/**
 * @typedef {BaseContainer} UpdatedContainer
 * @property {Container} container.required - The container the revision belongs to.
 * @property {Array.<Product>} products.required - The products that should be contained in the
 * container.
 */
@Entity()
export default class UpdatedContainer extends BaseContainer {
  @PrimaryColumn()
  public containerId: number;

  @OneToOne(() => Container, {
    nullable: false,
  })
  @JoinColumn({ name: 'containerId' })
  public container: Container;

  @ManyToMany(() => Product)
  @JoinTable()
  public products: Product[];
}
