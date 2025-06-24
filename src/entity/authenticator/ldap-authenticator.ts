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
 * @module Authentication
 */

import {
  Column, Entity,
} from 'typeorm';
import AuthenticationMethod from './authentication-method';

const bufferTransformer = {
  to: (buffer: Buffer): string => {
    // Convert Buffer to hex string when saving to DB
    return buffer.toString('hex');
  },
  from: (hex: string): Buffer => {
    // Convert hex string back to Buffer when retrieving from DB
    return Buffer.from(hex, 'hex');
  },
};

/**
 * The LDAP Authenticator is used to authenticate users using LDAP.
 * This process contains some design decisions that are highlighted below.
 *
 * ## LDAP Authentication Flow
 * 1. **User** sends a request to the `/authentication/LDAP` endpoint.
 * 2. **Authentication Controller (AC)** uses a **bind user** and bind password to establish a connection to the LDAP server.
 * 3. **AC** searches for the user in the LDAP server.
 * 4. **AC** attempts to bind the user to the LDAP server.
 * 5. **AC** returns a `403 Forbidden` error if the user is not found, or the password is incorrect.
 * 7. **AC** returns a `200 OK` response if the user is found in the LDAP server and the bind succeeds.
 *
 * If a user can log in but does not hava a **bound** account in SudoSOS, one will be created and bound (see {@link AuthenticationService#LDAPAuthentication}).
 * Accounts are bounded using the **objectGUID** of the AD user, which will be saved and stored in the database using the `LDAPAuthenticator` entity.
 * This UUID is the source of "truth" for which AD account a user is bound to.
 * In the future, this should remain as the source of truth. For example, it should override any linked ids.
 *
 * The following flowchart shows the LDAP authentication process.
 * <details>
 *
 * ```mermaid
 * graph TD
 *     A[Start] --> B{Receive LDAP Login Request}
 *     B --> C[Parse Request Body]
 *     C --> D[Establish LDAP Connection]
 *     D --> E{Search LDAP for User}
 *     E -->|Found| F[Attempt User Bind]
 *     E -->|Not Found| G[Return 403 Error]
 *
 *     F --> H{Bind Successful?}
 *     H -->|Yes| I{Check Local User Account}
 *     H -->|No| J[Return 403 Error]
 *
 *     I -->|Exists| M[Generate JWT Token]
 *     I -->|Not Exists| K[Create Local User & Bind]
 *     K --> M
 *
 *     M --> N[Return JWT Token]
 *
 *     style G fill:#f66
 *     style J fill:#f66
 *     style N stroke:#0a0,stroke-width:2px
 * ```
 * </details>
 *
 * @typedef {AuthenticationMethod} LDAPAuthenticator
 * @property {string} accountName.required - The associated AD account name
 * @property {Buffer} UUID.required - The associated AD account UUID
 * @promote
 * @index 1
 */
@Entity()
export default class LDAPAuthenticator extends AuthenticationMethod {
  @Column({
    type: 'varchar',
    length: 32,
    transformer: bufferTransformer,
  })
  public UUID: Buffer;
}
