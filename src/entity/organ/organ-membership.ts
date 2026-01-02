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
 * @module organ
 */

import {
  Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn,
} from 'typeorm';
import User from '../user/user';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * The OrganMembership entity tracks user membership in organs (shared accounts).
 * 
 * **Purpose:**
 * - Tracks which users are members of organs (UserType.ORGAN)
 * - Used for RBAC permission checks (determining 'organ' vs 'own' vs 'all' relations)
 * - Populates the JWT token's `organs` field
 * - Powers `userTokenInOrgan()` helper and `areInSameOrgan()` checks
 * 
 * @typedef {BaseEntityWithoutId} OrganMembership
 * @property {User.model} user.required - The user who is a member of the organ
 * @property {User.model} organ.required - The organ (shared account) that the user is a member of
 * 
 * @promote
 */
@Entity()
export default class OrganMembership extends BaseEntityWithoutId {
  @PrimaryColumn()
  public userId: number;

  @OneToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @PrimaryColumn()
  public organId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'organId' })
  public organ: User;

  @Column({ nullable: false })
  public index: number;
}
