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

import log4js from 'log4js';
import TaskService from '../service/task-service';
import { applyConfiguredLogLevel } from '../helpers/logging';

const logger = log4js.getLogger('TaskPoller');
applyConfiguredLogLevel(logger);

export interface TaskPoller {
  stop(): void;
}

const DEFAULT_INTERVAL_MS = 1000;

/**
 * Fallback executor for when Redis (and therefore BullMQ) is not available.
 * Polls the `task` table once per second and runs the next eligible row.
 * Matches the cadence described in issue #322.
 */
export const startTaskPoller = (intervalMs: number = DEFAULT_INTERVAL_MS): TaskPoller => {
  let running = false;
  const tick = async () => {
    if (running) return; // skip overlap if a previous run is still in flight
    running = true;
    try {
      await TaskService.processNextTask();
    } catch (err) {
      logger.error(`Task poller iteration failed: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  // Don't keep the event loop alive purely for the poller. The HTTP server's
  // listener handles that.
  if (typeof handle.unref === 'function') handle.unref();

  logger.info(`TaskPoller running (interval ${intervalMs}ms).`);

  return {
    stop: () => clearInterval(handle),
  };
};
