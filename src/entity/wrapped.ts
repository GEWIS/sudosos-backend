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
 * This is the module page of the wrapped entity.
 *
 * @module entity/wrapped
 * @mergeTarget
 */
import { BaseEntity, Column, Entity, OneToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import User from './user/user';

/**
 * @typedef {BaseEntity} Wrapped
 * @property {number} userId - ID of the user
 * @property {number} transactionCount - Total number of transactions
 * @property {number} transactionPercentile - Percentile rank of the user's transactions
 * @property {string} transactionMaxDate - Date of the maximum transaction
 * @property {number} transactionMaxAmount - Amount of the maximum transaction
 * @property {number[]} transactionHeatmap - Heatmap data of transactions
 * @property {string} syncedFrom - The starting date from which the data was considered
 * @property {string} syncedTo - The last time the data was synced
 */

@Entity()
export default class Wrapped extends BaseEntity {
  @PrimaryColumn({
    type: 'integer',
  })
  public userId: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({
    type: 'integer',
  })
  public transactionCount: number;

  @Column({
    type: 'float',
  })
  public transactionPercentile: number;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  public transactionMaxDate: Date | null;

  @Column({
    type: 'integer',
  })
  public transactionMaxAmount: number;

  @Column({
    type: 'text',
  })
  public transactionHeatmap: string;

  @Column({
    type: 'float',
  })
  public spentPercentile: number;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  public syncedFrom: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  public syncedTo: Date | null;
}