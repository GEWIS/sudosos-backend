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
 * Worker pool that drains the `task` table. The atomic claim inside
 * `TaskService.processNextEligible` keeps concurrent workers (in this
 * process or across replicas) safe without explicit locking.
 *
 * @module tasks
 */

import log4js from 'log4js';
import TaskService from '../service/task-service';
import { applyConfiguredLogLevel } from '../helpers/logging';

const logger = log4js.getLogger('TaskRunner');
applyConfiguredLogLevel(logger);

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_IDLE_MS = 1000;

export interface TaskRunner {
  /** Number of parallel worker loops currently running. */
  readonly concurrency: number;
  /** Stop accepting work; resolves once every in-flight loop has exited. */
  stop(): Promise<void>;
}

export interface StartTaskRunnerOptions {
  /** Number of parallel worker loops (default: 5). */
  concurrency?: number;
  /** Sleep duration when the queue was empty on the last sweep (ms). */
  idleMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  // Don't hold the event loop open just for a poll-sleep.
  if (typeof t.unref === 'function') t.unref();
});

/**
 * Start the worker pool. Returns a handle whose `stop()` resolves cleanly
 * when every worker has finished its current task and exited.
 */
export const startTaskRunner = (options: StartTaskRunnerOptions = {}): TaskRunner => {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const idleMs = Math.max(100, options.idleMs ?? DEFAULT_IDLE_MS);

  const state = { stopping: false };
  const loops: Promise<void>[] = [];

  const workerLoop = async (): Promise<void> => {
    while (!state.stopping) {
      try {
        const ran = await TaskService.processNextEligible();
        if (!ran) {
          await sleep(idleMs);
        }
      } catch (err) {
        logger.error(`Worker iteration failed: ${(err as Error).message}`);
        await sleep(idleMs);
      }
    }
  };

  for (let i = 0; i < concurrency; i += 1) {
    loops.push(workerLoop());
  }

  logger.info(`TaskRunner running (concurrency ${concurrency}, idle ${idleMs}ms).`);

  return {
    concurrency,
    stop: async () => {
      state.stopping = true;
      await Promise.allSettled(loops);
      logger.info('TaskRunner stopped.');
    },
  };
};
