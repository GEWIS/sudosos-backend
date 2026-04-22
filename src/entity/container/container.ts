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
 * A `container` is a group of products of a single seller, offered together at one or more points of sale.
 * Typical containers are a bar fridge, a committee snack shelf, or a single event's stock.
 *
 * ### Seller and revenue
 * The container's `owner` is the **seller** for every purchase of its products. Money from a
 * {@link transactions/sub-transactions!SubTransaction | SubTransaction} flows to this user — not
 * to the point of sale operator, and not to the product's creator. This is how a single purchase
 * can be split across multiple organs: each
 * {@link transactions/sub-transactions!SubTransaction | SubTransaction} is tied to one container,
 * and therefore to one seller.
 *
 * ### Revisions
 * `Container` is paired with {@link ContainerRevision}. Each edit (name, product list) produces
 * a new revision; `currentRevision` points at the live one. Past purchases keep referencing the
 * revision that was current at the time, so price and composition history stays intact.
 * {@link ContainerRevision} is immutable — attempting to update one throws.
 *
 * Containers are soft-deleted via `deletedAt`; the rows remain so that historical
 * {@link transactions/sub-transactions!SubTransaction | SubTransaction} references stay valid.
 *
 * ### Visibility
 * - `public: true` — any user may include the container on their own point of sale.
 * - `public: false` — the container can only be attached to points of sale by users with explicit
 *   permission (typically the owner or an admin).
 *
 * For API interactions, refer to the [Swagger Documentation](https://sudosos.gewis.nl/api/api-docs/#/containers).
 *
 * @module catalogue/containers
 * @mergeTarget
 */

import {
  Column, DeleteDateColumn,
  Entity,
  ManyToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';

/**
 * TypeORM entity for the `containers` table.
 * @typedef {BaseEntity} Container
 * @property {integer} currentRevision - The current revision of the container. Can be null if no
 * revision exists.
 * @property {User.model} owner.required - The owner of the container.
 * @property {boolean} public - Whether the container can be added to pointOfSales by everyone.
 */
@Entity()
export default class Container extends BaseEntity {
  @Column({
    nullable: true,
  })
  public currentRevision: number;

  @DeleteDateColumn()
  public readonly deletedAt: Date | null;

  @ManyToOne(() => User, { nullable: false, eager: true })
  public owner: User;

  @Column({
    default: false,
  })
  public public: boolean;
}
