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
 * @module authentication
 */

import {
  Entity,
} from 'typeorm';
import HashBasedAuthenticationMethod from './hash-based-authentication-method';

/**
 * The Key Authenticator is used for API key-based authentication in SudoSOS.
 * This authentication method allows programmatic access to the system using
 * pre-generated API keys instead of user credentials.
 *
 * Key Authentication is a _hash-based authentication method_. This means that the
 * API key is hashed using bcrypt and stored in the database, and later compared
 * against the input during authentication attempts.
 *
 * ## Key Authentication Flow
 * 1. **Client** sends a request to the `/authentication/key` endpoint with user ID and API key.
 * 2. **Authentication Controller** looks up the user by ID.
 * 3. **Authentication Controller** retrieves the associated KeyAuthenticator.
 * 4. **Authentication Service** compares the provided key against the stored hash.
 * 5. **Authentication Controller** returns a JWT token if authentication succeeds.
 *
 * ## Use Cases
 * - Automated systems that need to access the SudoSOS API
 * - Third-party integrations
 * - Scripts and tools that require programmatic access
 * - Testing and development environments
 *
 * @typedef {HashBasedAuthenticationMethod} KeyAuthenticator
 * @property {string} hash.required - The API key of this user (hashed using bcrypt)
 *
 * @promote
 */
@Entity()
export default class KeyAuthenticator extends HashBasedAuthenticationMethod {}
