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
 * This is the module page of the authentication-qr-response.
 *
 * @module authentication
 */

import { QRAuthenticatorStatus } from '../../entity/authenticator/qr-authenticator';

/**
 * @typedef {object} QRCodeResponse
 * @property {string} sessionId.required - The session ID
 * @property {string} qrCodeUrl.required - The QR code URL
 * @property {string} expiresAt.required - The expiry date of the QR code
 */
export interface QRCodeResponse {
  sessionId: string;
  qrCodeUrl: string;
  expiresAt: string;
}

/**
 * @typedef {object} QRStatusResponse
 * @property {string} status.required - enum:PENDING,CONFIRMED,EXPIRED,CANCELLED - The status of the QR code
 */
export interface QRStatusResponse {
  status: QRAuthenticatorStatus;
}