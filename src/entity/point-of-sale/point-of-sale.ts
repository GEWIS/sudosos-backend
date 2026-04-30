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
 * A `point of sale` (POS) is the surface on which SudoSOS transactions are created. Typical
 * examples are the bar terminal during a drink, a committee's order form, or an app instance
 * on an event laptop. A POS is not an organ — it is the *place where* people buy things.
 *
 * ### Owner, cashiers, and user
 * A POS has three user roles tied to it:
 * - `owner` — the user (typically an organ) that runs the POS. The owner can always open, edit,
 *   and create transactions on it.
 * - `user` — the dedicated "POS user" that the POS authenticates *as*. Tokens issued to the
 *   POS carry this user, so buyers charged through this POS show up under it.
 * - `cashierRoles` — any user that holds at least one of these roles can create transactions
 *   on this POS (but cannot open/edit/close it). Useful for shared bar shifts where many people
 *   need to ring up purchases but only the organ board manages the POS itself.
 *
 * ### Containers and products
 * A POS exposes its products indirectly: it holds a set of
 * {@link catalogue/containers!ContainerRevision | ContainerRevisions}, each of which groups the
 * products of one seller. This is how a single purchase through one POS can split across multiple
 * organs via {@link transactions/sub-transactions!SubTransaction | SubTransactions}. Display order
 * within a POS is controlled by {@link ProductOrdering}.
 *
 * ### Revisions
 * `PointOfSale` is paired with {@link PointOfSaleRevision}. Each edit (name, container list,
 * authentication flag) produces a new revision; `currentRevision` points at the live one. Past
 * transactions keep referencing the revision that was current at the time, so history stays
 * intact. {@link PointOfSaleRevision} is immutable — attempting to update one throws.
 *
 * POSs are soft-deleted via `deletedAt`; the rows remain so that historical
 * {@link transactions/sub-transactions!SubTransaction | SubTransaction} references stay valid.
 *
 * ### Authentication
 * If `useAuthentication` is `true`, buyers must present a PIN (or equivalent) before a transaction
 * can be recorded — used on public terminals. If `false`, the POS can ring up purchases without
 * buyer-side authentication (typical for trusted cashier setups).
 *
 * For API interactions, refer to the [Swagger Documentation](https://sudosos.gewis.nl/api/api-docs/#/pointofsales).
 *
 * @module catalogue/point-of-sale
 * @mergeTarget
 */

import {
  Column, DeleteDateColumn,
  Entity, JoinColumn, JoinTable, ManyToMany,
  ManyToOne, OneToOne,
} from 'typeorm';
import BaseEntity from '../base-entity';
import User from '../user/user';
import Role from '../rbac/role';

/**
 * TypeORM entity for the `point_of_sales` table.
 * @typedef {BaseEntity} PointOfSale
 * @property {integer} currentRevision - The current revision of the pointOfSale.
 * Can be null if no revision exists.
 * @property {User.model} owner.required - The owner of the pointOfSale.
 */
@Entity()
export default class PointOfSale extends BaseEntity {
  @Column({
    nullable: true,
  })
  public currentRevision: number;

  @DeleteDateColumn()
  public readonly deletedAt: Date | null;

  @ManyToOne(() => User, { nullable: false, eager: true })
  public owner: User;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn()
  public user: User;

  /**
   * Every user that belongs to at least one of such cashier roles can create
   * transactions in this POS, if the POS does not require authentication.
   * In contrary to owners, cashiers should not be able to open this POS or
   * make changes to it. Note that owners are always able to create transactions.
   */
  @ManyToMany(() => Role)
  @JoinTable()
  public cashierRoles: Role[];
}
