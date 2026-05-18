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
import { ConnectionOptions, Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import TaskService, { TASK_QUEUE_NAME } from '../service/task-service';
import { applyConfiguredLogLevel } from '../helpers/logging';

const logger = log4js.getLogger('TaskWorker');
applyConfiguredLogLevel(logger);

interface TaskJobData {
  taskId: number;
}

/**
 * Start the BullMQ-backed task worker. It pulls `{ taskId }` jobs from the
 * `task-queue` and delegates to `TaskService.runTask`, which writes outcomes
 * back to the DB.
 */
export const startTaskWorker = (redisConnection: Redis): Worker<TaskJobData> => {
  const worker = new Worker<TaskJobData>(
    TASK_QUEUE_NAME,
    async (job: Job<TaskJobData>) => {
      logger.debug(`Processing task ${job.data.taskId}`);
      await TaskService.runTask(job.data.taskId);
    },
    {
      connection: redisConnection as unknown as ConnectionOptions,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.debug(`Task ${job.data.taskId} job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Task ${job?.data?.taskId} job ${job?.id} failed: ${err.message}`);
  });

  logger.info('TaskWorker running and listening for jobs.');
  return worker;
};
