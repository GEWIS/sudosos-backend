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
  Entity,
} from 'typeorm';
import HashBasedAuthenticationMethod from './hash-based-authentication-method';

/**
 * The Local Authenticator is used for users who have local accounts in SudoSOS.
 * This authentication method allows users to create accounts directly in the system
 * without relying on external authentication providers like LDAP.
 *
 * Local Authentication is a _hash-based authentication method_. This means that the
 * password is hashed using bcrypt and stored in the database, and later compared
 * against the input of the user during login attempts.
 *
 * ## Local Authentication Flow
 * 1. **User** sends a request to the `/authentication/local` endpoint with email and password.
 * 2. **Authentication Controller** looks up the user by email address.
 * 3. **Authentication Controller** retrieves the associated LocalAuthenticator.
 * 4. **Authentication Service** compares the provided password against the stored hash.
 * 5. **Authentication Controller** returns a JWT token if authentication succeeds.
 *
 * ## Password Reset Flow
 * Local users can reset their passwords through a token-based system:
 * 1. User requests password reset via `/authentication/local/reset`.
 * 2. System generates a ResetToken and sends it via email.
 * 3. User provides the token and new password via `/authentication/local` (PUT).
 * 4. System validates the token and updates the password hash.
 *
 * @typedef {HashBasedAuthenticationMethod} LocalAuthenticator
 * @property {string} hash.required - The password of this user (hashed using bcrypt)
 *
 * @promote
 */
@Entity()
export default class LocalAuthenticator extends HashBasedAuthenticationMethod {}
