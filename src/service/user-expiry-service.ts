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

import User, { LocalUserTypes } from '../entity/user/user';
import WithManager from '../database/with-manager';
import { In, LessThanOrEqual, Not, IsNull, And, MoreThan } from 'typeorm';
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
   * Only affects accounts of local user types ({@link LocalUserTypes}) that are
   * currently active, not deleted, and have an expiryDate set.
   * Sends an account expired notification to each deactivated user before persisting
   * the deactivation; users whose notification fails are not deactivated so they
   * remain eligible for the next run.
   * @returns The list of users that were set to inactive.
   */
  public async deactivateExpiredUsers(): Promise<User[]> {
    const now = new Date();
    const toDeactivate = await User.find({
      where: {
        active: true,
        deleted: false,
        type: In(LocalUserTypes),
        expiryDate: And(Not(IsNull()), LessThanOrEqual(now)),
      },
    });

    const results = await Promise.allSettled(
      toDeactivate.map(async (u) => {
        await Notifier.getInstance().notify({
          type: NotificationTypes.UserAccountExpired,
          userId: u.id,
          params: new UserAccountExpiredOptions(u.expiryDate!),
        });
        u.active = false;
        await u.save();
        return u;
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<User> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Sends a near-expiration notification to all active local users whose account
   * will expire within 30 days from now.
   * Only notifies accounts of local user types ({@link LocalUserTypes}) that are
   * currently active, not deleted, and have an expiryDate set.
   *
   * The `expiryNotificationSent` flag is persisted before dispatching the
   * notification: at-most-once delivery. If mail dispatch fails after the flag
   * is saved, the user is not re-notified on the next run -- this is preferable
   * to spamming users on repeated transient failures.
   * @returns The list of users for which both the flag was persisted and the
   *   notification was dispatched successfully.
   */
  public async notifyNearExpirationUsers(): Promise<User[]> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const nearExpiration = await User.find({
      where: {
        active: true,
        deleted: false,
        expiryNotificationSent: false,
        type: In(LocalUserTypes),
        expiryDate: And(Not(IsNull()), MoreThan(now), LessThanOrEqual(thirtyDaysFromNow)),
      },
    });

    const results = await Promise.allSettled(
      nearExpiration.map(async (u) => {
        u.expiryNotificationSent = true;
        await u.save();
        await Notifier.getInstance().notify({
          type: NotificationTypes.UserNearExpiration,
          userId: u.id,
          params: new UserNearExpirationOptions(u.expiryDate!),
        });
        return u;
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<User> => r.status === 'fulfilled')
      .map((r) => r.value);
  }
}
