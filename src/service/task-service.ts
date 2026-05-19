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
import { deserializeTaskPayload, serializeTaskPayload } from '../tasks/task-payload';

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

export const DEFAULT_TASK_LEASE_MS = 5 * 60 * 1000;

type ClaimedTaskTransition = Pick<
Task,
'payload' | 'status' | 'availableAt' | 'completedAt' | 'lastError' | 'lockedBy' | 'lockedUntil'
>;

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

    const maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer.');
    }

    const task = await Task.save({
      type,
      payload: serializeTaskPayload(payload ?? null),
      status: TaskStatus.PENDING,
      attempts: 0,
      maxAttempts,
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
  public static async claim(
    workerId: string = 'inline-worker',
    now: Date = new Date(),
    leaseMs: number = DEFAULT_TASK_LEASE_MS,
  ): Promise<Task | null> {
    if (!Number.isFinite(leaseMs) || leaseMs < 1) {
      throw new RangeError('leaseMs must be a positive number.');
    }

    while (true) {
      const candidate = await Task.findOne({
        where: {
          status: TaskStatus.PENDING,
          availableAt: Or(IsNull(), LessThanOrEqual(now)),
        },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      if (!candidate) return null;

      const result = await AppDataSource
        .createQueryBuilder()
        .update(Task)
        .set({
          status: TaskStatus.PROCESSING,
          attempts: () => 'attempts + 1',
          startedAt: now,
          lockedBy: workerId,
          lockedUntil: new Date(now.getTime() + leaseMs),
          lastError: null,
          updatedAt: now,
        })
        .where('id = :id AND status = :pending', {
          id: candidate.id,
          pending: TaskStatus.PENDING,
        })
        .execute();

      if (result.affected === 1) {
        return Task.findOne({ where: { id: candidate.id } });
      }

      // Another worker won this row. Try the next pending task immediately
      // instead of putting this worker to sleep while work is still queued.
    }
  }

  /**
   * Claim and run the next eligible task. Returns `true` if a task ran (so
   * the caller can immediately try again), `false` when there was nothing to
   * do (so the caller should sleep before retrying).
   */
  public static async processNextEligible(
    workerId: string = 'inline-worker',
    leaseMs: number = DEFAULT_TASK_LEASE_MS,
  ): Promise<boolean> {
    const claimed = await this.claim(workerId, new Date(), leaseMs);
    if (!claimed) return false;
    await this.runClaimedTask(claimed, workerId, leaseMs);
    return true;
  }

  /**
   * Run a task that has already been claimed (status=processing). Used by
   * the worker pool after a successful claim and by the controller's retry
   * test path. The terminal state (completed, failed, or pending-with-
   * backoff) is written back to the DB.
   */
  private static async runClaimedTask(
    task: Task,
    workerId: string,
    leaseMs: number,
  ): Promise<void> {
    this.emitUpdate(task);

    const handler = taskRegistry.get(task.type);
    if (!handler) {
      await this.handleTaskError(
        task,
        workerId,
        `No handler registered for task type '${task.type}'.`,
        true,
      );
      this.logger.error(
        { taskId: task.id, type: task.type },
        'Task failed permanently: no handler.',
      );
      return;
    }

    let payload: unknown;
    try {
      payload = deserializeTaskPayload(task.payload);
    } catch (err) {
      await this.handleTaskError(
        task,
        workerId,
        `Could not parse payload: ${(err as Error).message}`,
        true,
      );
      return;
    }

    const heartbeat = this.startHeartbeat(task.id, workerId, leaseMs);
    try {
      await handler.handle(payload);
      const completed = await this.transitionClaimedTask(task.id, workerId, {
        payload: 'null',
        status: TaskStatus.COMPLETED,
        availableAt: null,
        completedAt: new Date(),
        lastError: null,
        lockedBy: null,
        lockedUntil: null,
      });
      if (completed) {
        this.emitUpdate(completed);
        this.logger.debug({ taskId: task.id, type: task.type }, 'Task completed.');
      }
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      await this.handleTaskError(task, workerId, message);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private static startHeartbeat(
    taskId: number,
    workerId: string,
    leaseMs: number,
  ): NodeJS.Timeout {
    const intervalMs = Math.max(10, Math.floor(leaseMs / 3));
    const heartbeat = setInterval(() => {
      void this.extendLease(taskId, workerId, leaseMs).catch((error) => {
        this.logger.error(
          { taskId, workerId, error },
          'Could not extend task lease.',
        );
      });
    }, intervalMs);
    heartbeat.unref();
    return heartbeat;
  }

  private static async extendLease(
    taskId: number,
    workerId: string,
    leaseMs: number,
  ): Promise<void> {
    const now = new Date();
    const result = await AppDataSource
      .createQueryBuilder()
      .update(Task)
      .set({ lockedUntil: new Date(now.getTime() + leaseMs) })
      .where('id = :taskId AND status = :processing AND lockedBy = :workerId', {
        taskId,
        processing: TaskStatus.PROCESSING,
        workerId,
      })
      .execute();

    if (result.affected !== 1) {
      this.logger.warn({ taskId, workerId }, 'Task lease was lost.');
    }
  }

  private static async handleTaskError(
    task: Task,
    workerId: string,
    message: string,
    permanent: boolean = false,
  ): Promise<void> {
    const exhausted = permanent || task.attempts >= task.maxAttempts;
    const updated = await this.transitionClaimedTask(task.id, workerId, {
      payload: task.payload,
      status: exhausted ? TaskStatus.FAILED : TaskStatus.PENDING,
      availableAt: exhausted
        ? null
        : new Date(Date.now() + this.backoffMs(task.attempts)),
      completedAt: null,
      lastError: message,
      lockedBy: null,
      lockedUntil: null,
    });
    if (!updated) return;

    this.emitUpdate(updated);
    if (exhausted) {
      this.logger.error(
        { taskId: task.id, type: task.type, err: message },
        'Task failed permanently.',
      );
    } else {
      this.logger.warn(
        { taskId: task.id, type: task.type, attempts: task.attempts, err: message },
        'Task failed; will retry.',
      );
    }
  }

  private static async transitionClaimedTask(
    taskId: number,
    workerId: string,
    transition: ClaimedTaskTransition,
  ): Promise<Task | null> {
    const result = await AppDataSource
      .createQueryBuilder()
      .update(Task)
      .set(transition)
      .where('id = :taskId AND status = :processing AND lockedBy = :workerId', {
        taskId,
        processing: TaskStatus.PROCESSING,
        workerId,
      })
      .execute();
    if (result.affected !== 1) {
      this.logger.warn({ taskId, workerId }, 'Skipped task transition after lease loss.');
      return null;
    }
    return Task.findOne({ where: { id: taskId } });
  }

  /**
   * Recover tasks whose worker stopped renewing its lease. Attempts that
   * already reached their limit become failed; the rest return to the queue.
   */
  public static async recoverStaleTasks(now: Date = new Date()): Promise<number> {
    const staleTasks = await Task.find({
      where: [
        { status: TaskStatus.PROCESSING, lockedUntil: IsNull() },
        { status: TaskStatus.PROCESSING, lockedUntil: LessThanOrEqual(now) },
      ],
    });

    let recovered = 0;
    for (const task of staleTasks) {
      const exhausted = task.attempts >= task.maxAttempts;
      const result = await AppDataSource
        .createQueryBuilder()
        .update(Task)
        .set({
          status: exhausted ? TaskStatus.FAILED : TaskStatus.PENDING,
          availableAt: exhausted
            ? null
            : new Date(now.getTime() + this.backoffMs(Math.max(1, task.attempts))),
          completedAt: null,
          lastError: 'Worker lease expired before task completion.',
          lockedBy: null,
          lockedUntil: null,
        })
        .where('id = :taskId AND status = :processing', {
          taskId: task.id,
          processing: TaskStatus.PROCESSING,
        })
        .andWhere('(lockedUntil IS NULL OR lockedUntil <= :now)', { now })
        .execute();

      if (result.affected === 1) {
        recovered += 1;
        const updated = await Task.findOne({ where: { id: task.id } });
        if (updated) this.emitUpdate(updated);
      }
    }

    if (recovered > 0) {
      this.logger.warn({ recovered }, 'Recovered tasks with expired worker leases.');
    }
    return recovered;
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
    task.lockedBy = null;
    task.lockedUntil = null;
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
      status: task.status,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      availableAt: task.availableAt ? task.availableAt.toISOString() : null,
      startedAt: task.startedAt ? task.startedAt.toISOString() : null,
      lockedUntil: task.lockedUntil ? task.lockedUntil.toISOString() : null,
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
      void WebSocketService.getInstance().emit(
        'task:updated',
        this.asTaskResponse(task),
      );
    } catch {
      // WebSocketService not initialised (e.g. test harness); skip.
    }
  }
}
