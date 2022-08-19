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
import BasePointOfSale from './base-point-of-sale';
import PointOfSale from './point-of-sale';
import Container from '../container/container';

/**
 * @typedef {BasePointOfSale} UpdatedPointOfSale
 * @property {PointOfSale} pointOfSale.required - The pointOfSale the revision belongs to.
 * @property {Array.<Container>} containers.required - The containers that should be contained
 * in the pointOfSale.
 */
@Entity()
export default class UpdatedPointOfSale extends BasePointOfSale {
  @PrimaryColumn()
  public pointOfSaleId: number;

  @OneToOne(() => PointOfSale, {
    nullable: false,
  })
  @JoinColumn({ name: 'pointOfSaleId' })
  public pointOfSale: PointOfSale;

  @ManyToMany(() => Container)
  @JoinTable()
  public containers: Container[];
}
