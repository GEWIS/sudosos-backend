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
  Column, Entity,
} from 'typeorm';
import AuthenticationMethod from './authentication-method';

/**
 * The NFC Authenticator is used for Near Field Communication (NFC) card-based authentication.
 * This authentication method allows users to authenticate using physical NFC cards or tags
 * by simply tapping them against an NFC reader.
 *
 * NFC Authentication is a _direct authentication method_. Unlike hash-based methods, the
 * NFC code (UID) is stored directly in the database and compared against the scanned value.
 * This provides fast authentication suitable for point-of-sale scenarios.
 *
 * ## NFC Authentication Flow
 * 1. **User** taps their NFC card against an NFC reader.
 * 2. **Reader** captures the NFC UID and sends it to `/authentication/nfc`.
 * 3. **Authentication Controller** looks up the NfcAuthenticator by the provided UID.
 * 4. **Authentication Controller** retrieves the associated user.
 * 5. **Authentication Controller** returns a JWT token if the NFC code is valid.
 *
 * ## Security Considerations
 * - NFC codes are stored in plain text (not hashed) for fast lookup
 * - NFC authentication can return a "lesser" JWT token (when posId is provided) to limit access scope.
 *   A token is considered "lesser" if it has a posId property set.
 * - Physical possession of the NFC card is required for authentication
 *
 * @typedef {AuthenticationMethod} NfcAuthenticator
 * @property {string} nfcCode.required - The unique identifier (UID) of the NFC chip
 *
 * @promote
 */
@Entity()
export default class NfcAuthenticator extends AuthenticationMethod {
  @Column({ unique: true })
  public nfcCode: string;
}
