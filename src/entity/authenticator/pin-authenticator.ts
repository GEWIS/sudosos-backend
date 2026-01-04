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
 * PIN Authentication can return a lesser JWT token (when posId is provided) and should only be used for authenticating at a point of sale.
 * The reason for returning a lesser JWT token is to prevent brute-force attacks, since PINs are 4-digit numbers and could easily be guessed.
 * A token is considered "lesser" if it has a posId property set.
 *
 * PIN Authentication is a _hash-based authentication method_. This means that the PIN code is hashed and stored in the database, and later compared against the input of the user.
 *
 * @typedef {HashBasedAuthenticationMethod} PinAuthenticator
 * @property {string} hash.required - The PIN code of this user (hashed)
 *
 * @promote
 * @index 0
 */
@Entity()
export default class PinAuthenticator extends HashBasedAuthenticationMethod {}
