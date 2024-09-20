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
 * This is the module page of the point-of-sale.
 *
 * @module inventory/pointsofsale
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
