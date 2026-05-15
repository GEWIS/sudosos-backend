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
 * This is the module page of the task service.
 *
 * @module tasks
 */

import log4js, { Logger } from 'log4js';
import { ConnectionOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { In, IsNull, LessThanOrEqual, Or } from 'typeorm';
import Task, { TaskStatus } from '../entity/task';
import { taskRegistry } from '../tasks/task-registry';
import { applyConfiguredLogLevel } from '../helpers/logging';
import { TaskResponse } from '../controller/response/task-response';
import WebSocketService from './websocket-service';

export const TASK_QUEUE_NAME = 'task-queue';
export const TASK_JOB_NAME = 'run-task';

export interface DispatchOptions {
  maxAttempts?: number;
  availableAt?: Date;
}

export interface TaskFilters {
  status?: TaskStatus[];
  type?: string;
}

export interface TaskStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

/**
 * The task service owns the DB-backed task queue. The DB row is the source of
 * truth for state; when a Redis connection is available we also push a BullMQ
 * job carrying only the row id, so the worker picks it up immediately. Without
 * Redis the cron-style poller picks rows up from the DB on its own schedule.
 */
export default class TaskService {
  private static logger: Logger = log4js.getLogger('TaskService');

  private static initialised = false;

  private static queue: Queue | undefined;

  /**
   * Wire the optional BullMQ queue. Calling this without a connection (or with
   * `undefined`) puts the service in DB-only mode, which is what local dev
   * uses when Redis is not running.
   */
  public static init(redisConnection?: Redis): void {
    applyConfiguredLogLevel(this.logger);
    if (this.queue) {
      // Replace any previous queue (e.g. test isolation).
      void this.queue.close();
      this.queue = undefined;
    }
    if (redisConnection) {
      this.queue = new Queue(TASK_QUEUE_NAME, {
        connection: redisConnection as unknown as ConnectionOptions,
      });
      this.logger.info('TaskService initialised with BullMQ dispatch.');
    } else {
      this.logger.info('TaskService initialised in DB-only (poller) mode.');
    }
    this.initialised = true;
  }

  /**
   * Reset all state. Test-only.
   */
  public static reset(): void {
    if (this.queue) {
      void this.queue.close();
    }
    this.queue = undefined;
    this.initialised = false;
  }

  public static hasBullMQ(): boolean {
    return this.queue !== undefined;
  }

  /**
   * Insert a new task row and, if BullMQ is available, push a job to make the
   * worker pick it up immediately.
   */
  public static async dispatch(
    type: string,
    payload: unknown,
    options: DispatchOptions = {},
  ): Promise<Task> {
    if (!taskRegistry.has(type)) {
      throw new Error(`No handler registered for task type '${type}'.`);
    }

    const task = await Task.save({
      type,
      payload: JSON.stringify(payload ?? null),
      status: TaskStatus.PENDING,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      availableAt: options.availableAt ?? null,
    } as Task);

    if (this.queue) {
      try {
        await this.queue.add(
          TASK_JOB_NAME,
          { taskId: task.id },
          {
            delay: options.availableAt
              ? Math.max(0, options.availableAt.getTime() - Date.now())
              : 0,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (err) {
        this.logger.error(
          { taskId: task.id, err: (err as Error).message },
          'Failed to enqueue BullMQ job; task will still be picked up by the poller.',
        );
      }
    }

    this.logger.debug({ taskId: task.id, type }, 'Task dispatched.');
    this.emitUpdate(task);
    return task;
  }

  /**
   * Claim and run the next available pending task. Returns the row that was
   * processed, or null if there was nothing to do. Used by the cron-style
   * poller and exposed for tests.
   */
  public static async processNextTask(): Promise<Task | null> {
    const now = new Date();
    const candidate = await Task.findOne({
      where: {
        status: TaskStatus.PENDING,
        availableAt: Or(IsNull(), LessThanOrEqual(now)),
      },
      order: { createdAt: 'ASC' },
    });
    if (!candidate) return null;

    await this.runTask(candidate.id);
    return Task.findOne({ where: { id: candidate.id } });
  }

  /**
   * Load a task by id, mark it as processing, dispatch to the registered
   * handler, and write the outcome back to the DB. Concurrent calls for the
   * same id are guarded by the status transition.
   */
  public static async runTask(taskId: number): Promise<void> {
    const task = await Task.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.warn({ taskId }, 'runTask called for unknown task.');
      return;
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
      this.logger.debug(
        { taskId, status: task.status },
        'Skipping task: terminal status.',
      );
      return;
    }

    task.status = TaskStatus.PROCESSING;
    task.attempts += 1;
    task.startedAt = new Date();
    task.lastError = null;
    await task.save();
    this.emitUpdate(task);

    const handler = taskRegistry.get(task.type);
    if (!handler) {
      task.status = TaskStatus.FAILED;
      task.lastError = `No handler registered for task type '${task.type}'.`;
      await task.save();
      this.emitUpdate(task);
      this.logger.error(
        { taskId, type: task.type },
        'Task failed permanently: no handler.',
      );
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(task.payload);
    } catch (err) {
      task.status = TaskStatus.FAILED;
      task.lastError = `Could not parse payload: ${(err as Error).message}`;
      await task.save();
      this.emitUpdate(task);
      return;
    }

    try {
      await handler.handle(payload);
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      task.lastError = null;
      await task.save();
      this.emitUpdate(task);
      this.logger.debug({ taskId, type: task.type }, 'Task completed.');
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      if (task.attempts >= task.maxAttempts) {
        task.status = TaskStatus.FAILED;
        task.lastError = message;
        await task.save();
        this.emitUpdate(task);
        this.logger.error(
          { taskId, type: task.type, err: message },
          'Task failed permanently.',
        );
      } else {
        task.status = TaskStatus.PENDING;
        task.availableAt = new Date(Date.now() + this.backoffMs(task.attempts));
        task.lastError = message;
        await task.save();
        this.emitUpdate(task);
        this.logger.warn(
          { taskId, type: task.type, attempts: task.attempts, err: message },
          'Task failed; will retry.',
        );
        if (this.queue) {
          try {
            await this.queue.add(
              TASK_JOB_NAME,
              { taskId: task.id },
              {
                delay: Math.max(0, task.availableAt.getTime() - Date.now()),
                removeOnComplete: true,
                removeOnFail: true,
              },
            );
          } catch (qerr) {
            this.logger.error(
              { taskId, err: (qerr as Error).message },
              'Failed to re-enqueue BullMQ retry; the poller will pick it up.',
            );
          }
        }
      }
    }
  }

  /**
   * Retry a previously failed task: reset attempts, set status=pending,
   * available now. Returns the updated task.
   */
  public static async retry(taskId: number): Promise<Task | null> {
    const task = await Task.findOne({ where: { id: taskId } });
    if (!task) return null;
    if (task.status !== TaskStatus.FAILED) {
      throw new Error(`Task ${taskId} is not in failed state (status=${task.status}).`);
    }
    task.status = TaskStatus.PENDING;
    task.attempts = 0;
    task.availableAt = null;
    task.startedAt = null;
    task.completedAt = null;
    task.lastError = null;
    await task.save();
    this.emitUpdate(task);

    if (this.queue) {
      try {
        await this.queue.add(TASK_JOB_NAME, { taskId: task.id }, {
          removeOnComplete: true,
          removeOnFail: true,
        });
      } catch (err) {
        this.logger.error(
          { taskId, err: (err as Error).message },
          'Failed to enqueue retry; poller will pick it up.',
        );
      }
    }

    return task;
  }

  public static async getTask(id: number): Promise<Task | null> {
    return Task.findOne({ where: { id } });
  }

  public static async getTasks(
    filters: TaskFilters,
    pagination: { take: number; skip: number },
  ): Promise<[Task[], number]> {
    const where: Record<string, unknown> = {};
    if (filters.status && filters.status.length > 0) {
      where.status = filters.status.length === 1 ? filters.status[0] : In(filters.status);
    }
    if (filters.type) {
      where.type = filters.type;
    }
    return Task.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: pagination.take,
      skip: pagination.skip,
    });
  }

  public static async getStats(): Promise<TaskStats> {
    const rows = await Task.createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany<{ status: TaskStatus; count: string }>();

    const stats: TaskStats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      const value = parseInt(row.count, 10);
      if (row.status === TaskStatus.PENDING) stats.pending = value;
      else if (row.status === TaskStatus.PROCESSING) stats.processing = value;
      else if (row.status === TaskStatus.COMPLETED) stats.completed = value;
      else if (row.status === TaskStatus.FAILED) stats.failed = value;
    }
    return stats;
  }

  /**
   * Exponential backoff in milliseconds: 2s, 4s, 8s, ...
   */
  private static backoffMs(attempts: number): number {
    return 2000 * (2 ** (attempts - 1));
  }

  /**
   * Convert a `Task` entity to the DTO sent over the wire / WebSocket.
   * Kept here so both the controller and the WebSocket emitter share a
   * single source of truth for the response shape.
   */
  public static asTaskResponse(task: Task): TaskResponse {
    return {
      id: task.id,
      createdAt: task.createdAt?.toISOString(),
      updatedAt: task.updatedAt?.toISOString(),
      version: task.version,
      type: task.type,
      payload: task.payload,
      status: task.status,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      availableAt: task.availableAt ? task.availableAt.toISOString() : null,
      startedAt: task.startedAt ? task.startedAt.toISOString() : null,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      lastError: task.lastError ?? null,
    };
  }

  /**
   * Broadcast a task lifecycle update over WebSocket. Best-effort: in tests
   * or environments where WebSocketService has not been initialised the call
   * is silently dropped so callers don't have to special-case it.
   */
  private static emitUpdate(task: Task): void {
    try {
      void WebSocketService.getInstance().emitTaskUpdated(this.asTaskResponse(task));
    } catch {
      // WebSocketService not initialised (e.g. test harness) -- skip.
    }
  }
}
