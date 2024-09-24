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
 * This is the module page of the point-of-sale-revision.
 *
 * @module inventory/point-of-sale
 */

import {
  Entity,
  ManyToOne,
  Column,
  BeforeUpdate, ManyToMany, JoinTable, PrimaryColumn, JoinColumn,
} from 'typeorm';
import PointOfSale from './point-of-sale';
// eslint-disable-next-line import/no-cycle
import ContainerRevision from '../container/container-revision';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {BaseEntityWithoutId} PointOfSaleRevision
 * @property {PointOfSale.model} pointOfSale.required - The pointOfSale the revision belongs to.
 * @property {integer} revision.required - The revision number of this revision.
 * @property {Array.<ContainerRevision>} containers.required - The containers that are contained
 * in this revision.
 * @property {string} name.required - The name of the pointOfSale.
 * @property {boolean} useAuthentication.required - Whether this POS requires users to authenticate
 * themselves before making a transaction
 */
@Entity()
export default class PointOfSaleRevision extends BaseEntityWithoutId {
  @PrimaryColumn()
  public readonly pointOfSaleId: number;

  @ManyToOne(() => PointOfSale, {
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'pointOfSaleId' })
  public readonly pointOfSale: PointOfSale;

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
    default: false,
  })
  public useAuthentication: boolean;

  @ManyToMany(() => ContainerRevision, (container) => container.pointsOfSale)
  @JoinTable()
  public containers: ContainerRevision[];

  @BeforeUpdate()
  // eslint-disable-next-line class-methods-use-this
  denyUpdate() {
    throw new Error('Immutable entities cannot be updated.');
  }
}
