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
import { In, IsNull, LessThanOrEqual, Or } from 'typeorm';
import Task, { TaskStatus } from '../entity/task';
import { AppDataSource } from '../database/database';
import { taskRegistry } from '../tasks/task-registry';
import { applyConfiguredLogLevel } from '../helpers/logging';
import { TaskResponse } from '../controller/response/task-response';
import WebSocketService from './websocket-service';

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
 * Database-backed task queue.
 *
 * The `task` row is the source of truth for state. Pending rows are claimed
 * atomically by the worker pool via a SELECT-then-UPDATE pattern: the UPDATE
 * filters on `status='pending'` and we accept the row only if `affected = 1`,
 * which makes two workers (in the same process or across replicas) safe
 * without explicit locking.
 */
export default class TaskService {
  private static logger: Logger = log4js.getLogger('TaskService');

  private static initialised = false;

  public static init(): void {
    applyConfiguredLogLevel(this.logger);
    this.initialised = true;
    this.logger.debug('TaskService initialised.');
  }

  /**
   * Reset all state. Test-only.
   */
  public static reset(): void {
    this.initialised = false;
  }

  /**
   * Insert a new pending task row. The worker pool will pick it up on its
   * next sweep; callers don't need to wait.
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

    this.logger.debug({ taskId: task.id, type }, 'Task dispatched.');
    this.emitUpdate(task);
    return task;
  }

  /**
   * Atomically claim the oldest eligible pending task and transition it to
   * `processing`. Returns the claimed row, or `null` if there was nothing to
   * do (or another worker won the race). Used by the worker pool and by
   * `processNextEligible` below.
   */
  public static async claim(now: Date = new Date()): Promise<Task | null> {
    const candidate = await Task.findOne({
      where: {
        status: TaskStatus.PENDING,
        availableAt: Or(IsNull(), LessThanOrEqual(now)),
      },
      order: { createdAt: 'ASC' },
    });
    if (!candidate) return null;

    const result = await AppDataSource
      .createQueryBuilder()
      .update(Task)
      .set({
        status: TaskStatus.PROCESSING,
        attempts: () => 'attempts + 1',
        startedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where('id = :id AND status = :pending', {
        id: candidate.id,
        pending: TaskStatus.PENDING,
      })
      .execute();

    if (result.affected !== 1) {
      // Another worker claimed it between our SELECT and UPDATE.
      return null;
    }

    return Task.findOne({ where: { id: candidate.id } });
  }

  /**
   * Claim and run the next eligible task. Returns `true` if a task ran (so
   * the caller can immediately try again), `false` when there was nothing to
   * do (so the caller should sleep before retrying).
   */
  public static async processNextEligible(): Promise<boolean> {
    const claimed = await this.claim();
    if (!claimed) return false;
    await this.runClaimedTask(claimed);
    return true;
  }

  /**
   * Run a task that has already been claimed (status=processing). Used by
   * the worker pool after a successful claim and by the controller's retry
   * test path. The terminal state (completed, failed, or pending-with-
   * backoff) is written back to the DB.
   */
  private static async runClaimedTask(task: Task): Promise<void> {
    this.emitUpdate(task);

    const handler = taskRegistry.get(task.type);
    if (!handler) {
      task.status = TaskStatus.FAILED;
      task.lastError = `No handler registered for task type '${task.type}'.`;
      await task.save();
      this.emitUpdate(task);
      this.logger.error(
        { taskId: task.id, type: task.type },
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
      this.logger.debug({ taskId: task.id, type: task.type }, 'Task completed.');
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      if (task.attempts >= task.maxAttempts) {
        task.status = TaskStatus.FAILED;
        task.lastError = message;
        await task.save();
        this.emitUpdate(task);
        this.logger.error(
          { taskId: task.id, type: task.type, err: message },
          'Task failed permanently.',
        );
      } else {
        task.status = TaskStatus.PENDING;
        task.availableAt = new Date(Date.now() + this.backoffMs(task.attempts));
        task.lastError = message;
        await task.save();
        this.emitUpdate(task);
        this.logger.warn(
          { taskId: task.id, type: task.type, attempts: task.attempts, err: message },
          'Task failed; will retry.',
        );
      }
    }
  }

  /**
   * Retry a previously failed task: reset attempts and status so the worker
   * pool picks it up again on the next sweep.
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
      void WebSocketService.getInstance().emit('task:updated', this.asTaskResponse(task));
    } catch {
      // WebSocketService not initialised (e.g. test harness); skip.
    }
  }
}
