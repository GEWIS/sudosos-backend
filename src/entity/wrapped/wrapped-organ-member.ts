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
 * This is the module page of the wrapped-organ-member entity.
 *
 * @module entity/wrapped
 */
import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import User from '../user/user';
import Wrapped from '../wrapped';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {BaseEntityWithoutId} WrappedOrganMember
 * @property {number} userId.required - ID of the user
 * @property {number} organId.required - ID of the organ
 * @property {number} ordinalTransactionCreated.required - 0-based ranking for transaction count created
 * @property {number} ordinalTurnoverCreated.required - 0-based ranking for turnover amount created
 */
@Entity()
export default class WrappedOrganMember extends BaseEntityWithoutId {
  @PrimaryColumn({
    type: 'integer',
  })
  public userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @PrimaryColumn({
    type: 'integer',
  })
  public organId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'organId' })
  public organ: User;

  @ManyToOne(() => Wrapped, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', referencedColumnName: 'userId' })
  public wrapped: Wrapped;

  @Column({
    type: 'integer',
    nullable: false,
    default: 0,
  })
  public ordinalTransactionCreated: number;

  @Column({
    type: 'integer',
    nullable: false,
    default: 0,
  })
  public ordinalTurnoverCreated: number;
}

