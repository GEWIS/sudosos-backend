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
 * This is the page of qr-authenticator.
 *
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

const QR_AUTHENTICATOR_EXPIRES_IN = process.env.QR_AUTHENTICATOR_EXPIRES_IN ? parseInt(process.env.QR_AUTHENTICATOR_EXPIRES_IN, 10) : 5 * 60 * 1000;

/**
 * @typedef {BaseEntityWithoutId} QRAuthenticator
 * @property {string} sessionId.required - Unique session identifier
 * @property {User.model} user - The user that confirmed the session (null if pending)
 * @property {string} status.required - The status of the session
 * @property {string} expiresAt.required - When the session expires
 * @property {string} createdAt.required - When the session was created
 * @property {string} confirmedAt - When the session was confirmed
 */
@Entity()
export default class QRAuthenticator extends BaseEntityWithoutId {
  @PrimaryColumn({
    type: 'varchar',
    length: 36,
  })
  public sessionId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  public user: User | null;

  @Column({
    default: QRAuthenticatorStatus.PENDING,
    nullable: false,
  })
  public status: QRAuthenticatorStatus;

  @Column({
    type: 'datetime',
  })
  public expiresAt: Date;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  public confirmedAt: Date | null;

  response(): QRCodeResponse {
    return {
      sessionId: this.sessionId,
      qrCodeUrl: `${process.env.URL || 'http://10.0.3.7:5173'}/auth/qr/confirm?sessionId=${this.sessionId}`,
      expiresAt: this.expiresAt.toISOString(),
    };
  }
  
  constructor() {
    super();
    this.sessionId = uuidv4();
    this.user = null;
    this.status = QRAuthenticatorStatus.PENDING;
    this.expiresAt = new Date(Date.now() + QR_AUTHENTICATOR_EXPIRES_IN);
    this.confirmedAt = null;
  }
}

