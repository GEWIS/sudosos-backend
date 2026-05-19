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
 * @module tasks
 */

import BaseResponse from './base-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * API response for the `task` entity.
 * @typedef {allOf|BaseResponse} TaskResponse
 * @property {string} type.required - Handler key, e.g. 'send-notification'.
 * @property {string} payload.required - JSON-encoded handler payload.
 * @property {string} status.required - One of pending, processing, completed, failed.
 * @property {integer} attempts.required - Attempts so far.
 * @property {integer} maxAttempts.required - Maximum attempts before status=failed.
 * @property {string} availableAt - Earliest time this task may be picked up.
 * @property {string} startedAt - When the most recent attempt began.
 * @property {string} completedAt - When the task finished successfully.
 * @property {string} lastError - Most recent error message.
 */
export interface TaskResponse extends BaseResponse {
  type: string;
  payload: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  availableAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
}

/**
 * Paginated API response for the `task` entity.
 * @typedef {object} PaginatedTaskResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata.
 * @property {Array.<TaskResponse>} records.required - The page of tasks.
 */
export interface PaginatedTaskResponse {
  _pagination: PaginationResult;
  records: TaskResponse[];
}

/**
 * Aggregate counts of tasks by status.
 * @typedef {object} TaskStatsResponse
 * @property {integer} pending.required - Count of tasks waiting to run.
 * @property {integer} processing.required - Count of tasks currently in flight.
 * @property {integer} completed.required - Count of tasks that succeeded.
 * @property {integer} failed.required - Count of tasks that gave up after retries.
 */
export interface TaskStatsResponse {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}
