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
 * This is the page of ldap-authenticator.
 *
 * @module authentication
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
 *
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
 *     I -->|Exists| K[Generate JWT Token]
 *     I -->|Not Exists| L[Create Local User & Bind]
 *     L --> M[Generate JWT Token]
 *
 *     K --> N[Return JWT Token]
 *     M --> N[Return JWT Token]
 *
 *     style G fill:#f66
 *     style J fill:#f66
 * ```
 *
 * @typedef {AuthenticationMethod} LDAPAuthenticator
 * @property {string} accountName.required - The associated AD account name
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
