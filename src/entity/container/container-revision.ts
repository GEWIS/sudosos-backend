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
 * This is the module page of container-revision.
 *
 * @module catalogue/containers
 */

import {
  Entity,
  Column,
  ManyToOne,
  BeforeUpdate, ManyToMany, JoinTable, PrimaryColumn, JoinColumn,
} from 'typeorm';
import Container from './container';
import ProductRevision from '../product/product-revision';
// eslint-disable-next-line import/no-cycle
import PointOfSaleRevision from '../point-of-sale/point-of-sale-revision';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {BaseEntityWithoutId} ContainerRevision
 * @property {Container.model} container.required - The container the revision belongs to.
 * @property {integer} revision.required - The revision number of this revision.
 * @property {Array.<ProductRevision>} products.required - The products that are contained in this
 * revision.
 * @property {string} name.required - The name of the container.
 */
@Entity()
export default class ContainerRevision extends BaseEntityWithoutId {
  @PrimaryColumn()
  public readonly containerId: number;

  @ManyToOne(() => Container, {
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'containerId' })
  public readonly container: Container;

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

  @ManyToMany(() => ProductRevision, (product) => product.containers)
  @JoinTable()
  public products: ProductRevision[];

  @ManyToMany(() => PointOfSaleRevision, (pointOfSale) => pointOfSale.containers)
  public pointsOfSale: PointOfSaleRevision[];

  @BeforeUpdate()
  // eslint-disable-next-line class-methods-use-this
  denyUpdate() {
    throw new Error('Immutable entities cannot be updated.');
  }
}
