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

import BaseEntity from '../base-entity';

/**
 * This is the module page of the user-notification-preference.
 *
 * @module notifications
 */

export enum NotificationChannels {
  EMAIL = 'EMAIL',
}

import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import User from '../user/user';
import { NotificationTypeRegistry, NotificationTypes } from '../../notifications/notification-types';

/**
 * @typedef {BaseEntity} UserNotificationPreference
 * @property {User.model} user - The user for which the notification was made.
 * @property {NotificationTypes} type - The type of notification.
 * @property {NotificationChannels} channel - The channel of the notification.
 * @property {boolean} enabled - Whether the user has this notification enabled.
 */
@Entity()
@Unique(['userId', 'channel', 'type'])
export default class UserNotificationPreference extends BaseEntity {
  @Column({ nullable: false })
  public userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({ nullable: false })
  public type: NotificationTypes;

  @Column({ nullable: false })
  public channel: NotificationChannels;

  @Column({ nullable: false })
  public enabled: boolean;

  /**
   * Returns whether this notification type is mandatory.
   *
   * @returns {boolean} True if this notification type is mandatory, false otherwise.
   */
  get isMandatory(): boolean {
    return NotificationTypeRegistry.isTypeMandatory(this.type);
  }
}