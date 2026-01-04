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
 * `banners` are used to manage promotional material within SudoSOS, commonly displayed on the point of sale.
 * They can be configured with a duration, activation status, and start/end dates to control their visibility.
 *
 * ### Usage
 * - Banners can be created, updated, or deleted by admins.
 * - Active banners can be retrieved without authentication.
 *
 * For API interactions, refer to the [Swagger Documentation](https://sudosos.gewis.nl/api/api-docs/#/banners).
 *
 * @module banners
 * @mergeTarget
 */

import {
  Column, Entity, JoinColumn, OneToOne,
} from 'typeorm';
import BaseEntity from './base-entity';
import BannerImage from './file/banner-image';

/**
 * TypeORM entity for the `banners` table.
 * @typedef {BaseEntity} Banner
 * @property {string} name - Name/label of the banner.
 * @property {integer} duration - How long the banner should be shown (in seconds).
 * @property {boolean} active - Whether the banner is active. Overrides start and end date.
 * @property {string} startDate - The starting date from which the banner should be shown.
 * @property {string} endDate - The end date from which the banner should no longer be shown.
 */
@Entity()
export default class Banner extends BaseEntity {
  @Column()
  public name: string;

  @Column({
    type: 'integer',
  })
  public duration: number;

  @Column({
    default: false,
  })
  public active: boolean;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  public startDate: Date;

  @Column({
    type: 'datetime',
  })
  public endDate: Date;

  // onDelete: 'CASCADE' is not possible here, because removing the
  // image from the database will not remove it form storage
  @OneToOne(() => BannerImage, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn()
  public image?: BannerImage;
}
