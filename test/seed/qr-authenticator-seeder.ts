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

import WithManager from '../../src/database/with-manager';
import QRAuthenticator, { QRAuthenticatorStatus } from '../../src/entity/authenticator/qr-authenticator';
import User from '../../src/entity/user/user';
import { getRandomDate } from './helpers';

/**
 * Seeder for QR authenticators
 */
export default class QRAuthenticatorSeeder extends WithManager {
  /**
   * Defines QR authenticator objects with the given parameters.
   *
   * @param count - The number of objects to define.
   * @param status - The status of the QR authenticators.
   * @param users - Optional users to associate with confirmed authenticators.
   * @param expired - Whether to create expired authenticators.
   */
  public defineQRAuthenticators(
    count: number,
    status: QRAuthenticatorStatus,
    users?: User[],
    expired = false,
  ): QRAuthenticator[] {
    const authenticators: QRAuthenticator[] = [];
    const now = new Date();
    const expiresIn = process.env.QR_AUTHENTICATOR_EXPIRES_IN ? parseInt(process.env.QR_AUTHENTICATOR_EXPIRES_IN, 10) : 5 * 60 * 1000;

    for (let nr = 0; nr < count; nr += 1) {
      const authenticator = new QRAuthenticator();
      
      if (expired) {
        // Create expired authenticators (expired 1 hour ago)
        authenticator.expiresAt = new Date(now.getTime() - 60 * 60 * 1000);
      } else {
        // Create valid authenticators (expires in the future)
        authenticator.expiresAt = new Date(now.getTime() + expiresIn);
      }

      // Set user and confirmedAt for confirmed authenticators
      if (status === QRAuthenticatorStatus.CONFIRMED && users && users.length > 0) {
        authenticator.user = users[nr % users.length];
        authenticator.confirmedAt = getRandomDate(
          new Date(now.getTime() - 10 * 60 * 1000), // 10 minutes ago
          now,
          nr,
        );
      } else {
        authenticator.user = null;
        authenticator.confirmedAt = null;
      }

      // Set cancelled flag for cancelled authenticators
      if (status === QRAuthenticatorStatus.CANCELLED) {
        authenticator.cancelled = true;
      }

      authenticators.push(authenticator);
    }
    return authenticators;
  }

  /**
   * Seeds a default dataset of QR authenticators and stores them in the database.
   * 
   * @param users - Optional users to associate with confirmed authenticators.
   */
  public async seed(users?: User[]): Promise<QRAuthenticator[]> {
    const authenticators: QRAuthenticator[] = [];

    // Create pending authenticators
    const pendingAuths = this.defineQRAuthenticators(5, QRAuthenticatorStatus.PENDING);
    authenticators.push(...pendingAuths);

    // Create confirmed authenticators
    const confirmedAuths = this.defineQRAuthenticators(3, QRAuthenticatorStatus.CONFIRMED, users);
    authenticators.push(...confirmedAuths);

    // Create expired authenticators
    const expiredAuths = this.defineQRAuthenticators(2, QRAuthenticatorStatus.EXPIRED, undefined, true);
    authenticators.push(...expiredAuths);

    // Create cancelled authenticators
    const cancelledAuths = this.defineQRAuthenticators(2, QRAuthenticatorStatus.CANCELLED);
    authenticators.push(...cancelledAuths);

    // Save all authenticators to the database
    await this.manager.save(QRAuthenticator, authenticators);

    return authenticators;
  }
}
