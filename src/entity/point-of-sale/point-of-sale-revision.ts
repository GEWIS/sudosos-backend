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
  ManyToOne,
  Column,
  BeforeUpdate, ManyToMany, JoinTable, PrimaryColumn, JoinColumn,
} from 'typeorm';
import BasePointOfSale from './base-point-of-sale';
import PointOfSale from './point-of-sale';
// eslint-disable-next-line import/no-cycle
import ContainerRevision from '../container/container-revision';

/**
 * @typedef {BasePointOfSale} PointOfSaleRevision
 * @property {PointOfSale.model} pointOfSale.required - The pointOfSale the revision belongs to.
 * @property {integer} revision.required - The revision number of this revision.
 * @property {Array.<ContainerRevision>} containers.required - The containers that are contained
 * in this revision.
 */
@Entity()
export default class PointOfSaleRevision extends BasePointOfSale {
  @PrimaryColumn()
  public readonly pointOfSaleId: number;

  @ManyToOne(() => PointOfSale, {
    nullable: false,
    // eager: true | I removed this because of a bug in typeorm. Typeorm prioritises
    // the eager keyword over the relations that you are trying to load additionally.
    // So once you specified eager it is not possible to get
    // PointOfSaleRevision -> PointOfSale -> User(owner). This is unfortunate. Lets wait for le fix
  })
  @JoinColumn({ name: 'pointOfSaleId' })
  public readonly pointOfSale: PointOfSale;

  @Column({
    primary: true,
    default: 1,
    nullable: false,
  })
  public revision: number;

  @ManyToMany(() => ContainerRevision, (container) => container.pointsOfSale)
  @JoinTable()
  public containers: ContainerRevision[];

  @BeforeUpdate()
  // eslint-disable-next-line class-methods-use-this
  denyUpdate() {
    throw new Error('Immutable entities cannot be updated.');
  }
}
