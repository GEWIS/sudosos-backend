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
 * This is the module page of the qr-service.
 *
 * @module authentication
 */

import WithManager from '../database/with-manager';
import QRAuthenticator, { QRAuthenticatorStatus } from '../entity/authenticator/qr-authenticator';
import User from '../entity/user/user';

export default class QRService extends WithManager {
    
  async get(sessionId: string): Promise<QRAuthenticator | null> {
    try {
      const qr = await this.manager.findOne<QRAuthenticator>(QRAuthenticator, { where: { sessionId } });
      if (qr.expiresAt < new Date() && qr.status === QRAuthenticatorStatus.PENDING) {
        qr.status = QRAuthenticatorStatus.EXPIRED;
        await this.manager.save(QRAuthenticator, qr);
      }
      return qr;
    } catch (error) {
      return null;
    }
  }
  
  async create(): Promise<QRAuthenticator> {
    const qr = this.manager.create(QRAuthenticator);
    await this.manager.save(QRAuthenticator, qr);
    return qr;
  }

  async confirm(qr: QRAuthenticator, user: User): Promise<void> {
    qr.user = user;
    qr.status = QRAuthenticatorStatus.CONFIRMED;
    qr.confirmedAt = new Date();
    await this.manager.save(QRAuthenticator, qr);
  }

  async cancel(qr: QRAuthenticator): Promise<void> {
    qr.status = QRAuthenticatorStatus.CANCELLED;
    await this.manager.save(QRAuthenticator, qr);
  }
}