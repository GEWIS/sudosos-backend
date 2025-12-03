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
 * This is the module page of the notification-log.
 *
 * @module notifications
 */

import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import User from '../user/user';
import { NotificationChannels } from './user-notification-preference';
import BaseEntity from '../base-entity';
import { NotificationTypes } from '../../notifications/notification-types';

/**
 * @typedef {BaseEntity} NotificationLog
 * @property {User.model} user - The user for which the log was made.
 * @property {NotificationChannels} handler - The channel of the notification.
 * @property {NotificationTypes} type - The type of notification.
 */
@Entity()
export default class NotificationLog extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({ nullable: true })
  public handler: NotificationChannels;

  @Column({ nullable: false })
  public type: NotificationTypes;
}