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
 * This is the module page of the send-notification task.
 *
 * @module tasks
 */

import Notifier from '../notifications/notifier';
import { NotificationTypes, TemplateOptions } from '../notifications/notification-types';
import { TaskHandler } from './task-registry';

export const SEND_NOTIFICATION_TASK_TYPE = 'send-notification';

export interface SendNotificationTaskPayload {
  type: NotificationTypes;
  userId: number;
  params: TemplateOptions;
}

export const sendNotificationTask: TaskHandler<SendNotificationTaskPayload> = {
  type: SEND_NOTIFICATION_TASK_TYPE,
  async handle(payload: SendNotificationTaskPayload): Promise<void> {
    await Notifier.getInstance().notifySync(payload);
  },
};
