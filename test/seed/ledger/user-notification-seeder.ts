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
import WithManager from '../../../src/database/with-manager';
import User from '../../../src/entity/user/user';
import UserNotificationPreference, {
  NotificationChannels,
} from '../../../src/entity/notifications/user-notification-preference';
import { NotificationTypes } from '../../../src/notifications/notification-types';

export default class UserNotificationSeeder extends WithManager {
  public async seed(users: User[]): Promise<UserNotificationPreference[]> {
    const userNotificationPreferences: UserNotificationPreference[] = [];

    const channels = Object.values(NotificationChannels);
    const types = Object.values(NotificationTypes);
    let preferenceId = 1;
    for (let i = 0; i < users.length; i += 1) {
      for (let c = 0; c < channels.length; c += 1) {
        for (let t = 0; t < types.length; t += 1) {
          const newPreference = Object.assign(new UserNotificationPreference(), {
            id: preferenceId++,
            userId: users[i].id,
            user: users[i],
            channel: channels[c],
            type: types[t],
            enabled: (c + t) % 2 === 0,
          });

          userNotificationPreferences.push(newPreference);
        }
      }
    }

    await this.manager.save(UserNotificationPreference, userNotificationPreferences);

    return userNotificationPreferences;
  }
}