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

import User, { UserType } from '../entity/user/user';
import WithManager from '../database/with-manager';
import Notifier from '../notifications/notifier';
import { NotificationTypes } from '../notifications/notification-types';
import { UserAccountExpiredOptions, UserNearExpirationOptions } from '../notifications/notification-options';

/**
 * This is the module page of the user-expiry-service.
 *
 * @module users
 *
 */

export default class UserExpiryService extends WithManager {
    
  /**
   * Sets all local users whose `expiryDate` is in the past to inactive.
   * Only affects LOCAL_USER accounts that are currently active,
   * not deleted, and have an expiryDate set.
   * Sends an account expired notification to each deactivated user.
   * @returns The list of users that were set to inactive.
   */
  public async deactivateExpiredUsers(): Promise<User[]> {
    const now = new Date();
    const activeUsers = await User.find({
      where: {
        active: true,
        deleted: false,
        type: UserType.LOCAL_USER,
      },
    });

    const toDeactivate = activeUsers.filter(
      (u) => u.expiryDate != null && u.expiryDate <= now,
    );

    await Promise.all(
      toDeactivate.map(async (u) => {
        u.active = false;
        await u.save();
      }),
    );

    await Promise.all(
      toDeactivate.map((u) =>
        Notifier.getInstance().notify({
          type: NotificationTypes.UserAccountExpired,
          userId: u.id,
          params: new UserAccountExpiredOptions(u.expiryDate),
        }),
      ),
    );

    return toDeactivate;
  }

  /**
   * Sends a near-expiration notification to all active local users whose account
   * will expire within 30 days from now.
   * Only notifies LOCAL_USER accounts that are currently active,
   * not deleted, and have an expiryDate set.
   * @returns The list of users that were notified.
   */
  public async notifyNearExpirationUsers(): Promise<User[]> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const activeUsers = await User.find({
      where: {
        active: true,
        deleted: false,
        type: UserType.LOCAL_USER,
      },
    });

    const nearExpiration = activeUsers.filter(
      (u) => u.expiryDate != null && u.expiryDate > now && u.expiryDate <= thirtyDaysFromNow,
    );

    await Promise.all(
      nearExpiration.map((u) =>
        Notifier.getInstance().notify({
          type: NotificationTypes.UserNearExpiration,
          userId: u.id,
          params: new UserNearExpirationOptions(u.expiryDate),
        }),
      ),
    );

    return nearExpiration;
  }
}

