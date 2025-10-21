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
  Column, Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import BaseEntityWithoutId from '../base-entity-without-id';
import User from '../user/user';
import { QRCodeResponse } from '../../controller/response/authentication-qr-response';

export enum QRAuthenticatorStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

const DEFAULT_QR_AUTHENTICATOR_EXPIRES_IN_MS = 5 * 60 * 1000;
const QR_AUTHENTICATOR_EXPIRES_IN = process.env.QR_AUTHENTICATOR_EXPIRES_IN
  ? parseInt(process.env.QR_AUTHENTICATOR_EXPIRES_IN, 10)
  : DEFAULT_QR_AUTHENTICATOR_EXPIRES_IN_MS;

/**
 * The QR Authenticator enables QR code-based authentication in SudoSOS.
 * This authentication method allows users to authenticate by scanning a QR code
 * with their mobile device, providing a convenient and secure authentication flow.
 *
 * QR Authentication is a _session-based authentication method_. It creates temporary
 * sessions that can be confirmed by authenticated users, allowing for secure
 * authentication flows without requiring direct credential input.
 *
 * ## QR Authentication Flow
 * 1. **Client** requests a QR code via `/authentication/qr/generate`.
 * 2. **QR Service** creates a QRAuthenticator with a unique session ID and expiration time.
 * 3. **Client** displays the QR code to the user.
 * 4. **User** scans the QR code with their mobile device.
 * 5. **Mobile App** opens the confirmation URL with the session ID.
 * 6. **Authenticated User** confirms the session via `/authentication/qr/{sessionId}/confirm`.
 * 7. **System** generates a JWT token and notifies the original client via WebSocket.
 *
 * ## Session States
 * - **PENDING**: Session is waiting for user confirmation
 * - **CONFIRMED**: Session has been confirmed by an authenticated user
 * - **EXPIRED**: Session has exceeded its expiration time
 * - **CANCELLED**: Session was explicitly cancelled
 *
 * ## Security Features
 * - Sessions have a configurable expiration time (default: 5 minutes)
 * - Each session has a unique UUID that cannot be guessed
 * - Sessions can be cancelled to prevent unauthorized access
 * - JWT tokens are only delivered via WebSocket, making them difficult to intercept
 *
 *
 * @typedef {BaseEntityWithoutId} QRAuthenticator
 * @property {string} sessionId.required - Unique session identifier (UUID)
 * @property {User.model} user - The user that confirmed the session (null if pending)
 * @property {boolean} cancelled.required - Whether the session was cancelled
 * @property {string} expiresAt.required - When the session expires
 * @property {string} createdAt.required - When the session was created
 * @property {string} confirmedAt - When the session was confirmed
 *
 * @promote
 */
@Entity()
export default class QRAuthenticator extends BaseEntityWithoutId {
  @PrimaryColumn({
    type: 'varchar',
    length: 36,
  })
  public sessionId: string;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'userId' })
  public user: User | null;

  @Column({
    default: false,
    nullable: false,
  })
  public cancelled: boolean;

  @Column({
    type: 'datetime',
  })
  public expiresAt: Date;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  public confirmedAt: Date | null;

  public get status(): QRAuthenticatorStatus {
    if (this.confirmedAt !== null) {
      return QRAuthenticatorStatus.CONFIRMED;
    }
    if (this.cancelled) {
      return QRAuthenticatorStatus.CANCELLED;
    }
    if (this.expiresAt < new Date()) {
      return QRAuthenticatorStatus.EXPIRED;
    }
    return QRAuthenticatorStatus.PENDING;
  }

  response(): QRCodeResponse {
    return {
      sessionId: this.sessionId,
      qrCodeUrl: `${process.env.URL || 'http://localhost:5173'}/auth/qr/confirm?sessionId=${this.sessionId}`,
      expiresAt: this.expiresAt.toISOString(),
    };
  }
  
  constructor() {
    super();
    this.sessionId = uuidv4();
    this.user = null;
    this.cancelled = false;
    this.expiresAt = new Date(Date.now() + QR_AUTHENTICATOR_EXPIRES_IN);
    this.confirmedAt = null;
  }
}

