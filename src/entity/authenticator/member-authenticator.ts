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
 * @module authentication
 */

import {
  Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import User from '../user/user';
import AuthenticationMethod from './authentication-method';

/**
 * The Member Authenticator represents the relationship between users and organs (shared accounts).
 * 
 * **Primary Purpose (KEEP):**
 * - Tracks user membership in organs (UserType.ORGAN)
 * - Used for RBAC permission checks (determining 'organ' vs 'own' vs 'all' relations)
 * - Populates the JWT token's `organs` field
 * - Powers `userTokenInOrgan()` helper and `areInSameOrgan()` checks
 * 
 * **Secondary Purpose (DEPRECATED):**
 * - Allows users to authenticate as another user via `POST /users/{id}/authenticate`
 * - This "proxy authentication" functionality enables users to obtain JWT tokens for other accounts
 * 
 * @deprecated The "authenticate as" functionality (POST /users/{id}/authenticate endpoint) allows 
 * hiding/delegating rights and will be removed. Delete from 01/06/2026.
 * 
 * @todo Remove the `POST /users/{id}/authenticate` endpoint and `authenticateAsUser()` handler 
 * in UserController. The membership tracking functionality (organs in JWT, RBAC checks) should 
 * be preserved as it's the intended use case.
 * 
 * @typedef {AuthenticationMethod} MemberAuthenticator
 * @property {User.model} authenticateAs.required - The organ (shared account) that the user is a member of
 * 
 * @promote
 */
@Entity()
export default class MemberAuthenticator extends AuthenticationMethod {
  @PrimaryColumn()
  public authenticateAsId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'authenticateAsId' })
  public authenticateAs: User;
}
