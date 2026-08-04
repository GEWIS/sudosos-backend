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
import { randomUUID } from 'crypto';
import TaskService, { DEFAULT_TASK_LEASE_MS } from '../service/task-service';
import { applyConfiguredLogLevel } from '../helpers/logging';

const logger = log4js.getLogger('TaskRunner');
applyConfiguredLogLevel(logger);

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_IDLE_MS = 1000;
const DEFAULT_RECOVERY_INTERVAL_MS = 60_000;

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
  /** Duration of a worker lease before a task can be recovered (ms). */
  leaseMs?: number;
  /** How often expired worker leases are recovered (ms). */
  recoveryIntervalMs?: number;
}

/**
 * Start the worker pool. Returns a handle whose `stop()` resolves cleanly
 * when every worker has finished its current task and exited.
 */
export const startTaskRunner = (options: StartTaskRunnerOptions = {}): TaskRunner => {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const leaseMs = options.leaseMs ?? DEFAULT_TASK_LEASE_MS;
  const recoveryIntervalMs = options.recoveryIntervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer.');
  }
  for (const [name, value] of Object.entries({ idleMs, leaseMs, recoveryIntervalMs })) {
    if (!Number.isFinite(value) || value < 1) {
      throw new RangeError(`${name} must be a positive number.`);
    }
  }

  const state = { stopping: false };
  const loops: Promise<void>[] = [];
  const wakeSleepers = new Set<() => void>();
  let nextRecoveryAt = 0;

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      wakeSleepers.delete(finish);
      resolve();
    };
    timeout = setTimeout(finish, ms);
    timeout.unref();
    wakeSleepers.add(finish);
  });

  const workerLoop = async (workerId: string): Promise<void> => {
    while (!state.stopping) {
      try {
        const now = Date.now();
        if (now >= nextRecoveryAt) {
          nextRecoveryAt = now + recoveryIntervalMs;
          await TaskService.recoverStaleTasks(new Date(now));
        }

        const ran = await TaskService.processNextEligible(workerId, leaseMs);
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
    loops.push(workerLoop(`${process.pid}-${i}-${randomUUID()}`));
  }

  logger.info(
    `TaskRunner running (concurrency ${concurrency}, idle ${idleMs}ms, lease ${leaseMs}ms).`,
  );

  return {
    concurrency,
    stop: async () => {
      state.stopping = true;
      wakeSleepers.forEach((wake) => wake());
      await Promise.allSettled(loops);
      logger.info('TaskRunner stopped.');
    },
  };
};
