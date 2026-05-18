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
 * This is the module page of task.
 *
 * @module internal/entities
 */

import { Column, Entity, Index } from 'typeorm';
import BaseEntity from './base-entity';

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Persistent representation of a background task. The DB row is the source of
 * truth; BullMQ jobs (when Redis is available) carry only the row's id.
 *
 * @typedef {BaseEntity} Task
 * @property {string} type.required - Handler key, e.g. 'send-notification'.
 * @property {string} payload.required - JSON-encoded handler payload.
 * @property {string} status.required - One of pending|processing|completed|failed.
 * @property {integer} attempts.required - How many times the task has been attempted.
 * @property {integer} maxAttempts.required - Maximum attempts before status=failed.
 * @property {string} availableAt - Earliest time at which the task may be picked up (ISO string).
 * @property {string} startedAt - When the most recent attempt began (ISO string).
 * @property {string} completedAt - When the task finished successfully (ISO string).
 * @property {string} lastError - Error message from the most recent failed attempt.
 */
@Entity()
@Index('IDX_task_status_availableAt', ['status', 'availableAt'])
@Index('IDX_task_type', ['type'])
export default class Task extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  public type: string;

  @Column({ type: 'text' })
  public payload: string;

  @Column({ type: 'varchar', length: 16, default: TaskStatus.PENDING })
  public status: TaskStatus;

  @Column({ type: 'int', default: 0 })
  public attempts: number;

  @Column({ type: 'int', default: 3 })
  public maxAttempts: number;

  @Column({ type: 'datetime', nullable: true })
  public availableAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  public startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  public completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  public lastError: string | null;
}
