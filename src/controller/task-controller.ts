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

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination, toResponse } from '../helpers/pagination';
import TaskService from '../service/task-service';
import Task, { TaskStatus } from '../entity/task';
import { TaskResponse } from './response/task-response';

const VALID_STATUSES = new Set<string>(Object.values(TaskStatus));

export default class TaskController extends BaseController {
  private logger: Logger = log4js.getLogger('TaskController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Task', ['*']),
          handler: this.listTasks.bind(this),
        },
      },
      '/stats': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Task', ['*']),
          handler: this.getStats.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Task', ['*']),
          handler: this.getTask.bind(this),
        },
      },
      '/:id(\\d+)/retry': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Task', ['*']),
          handler: this.retryTask.bind(this),
        },
      },
    };
  }

  public static asTaskResponse(task: Task): TaskResponse {
    return TaskService.asTaskResponse(task);
  }

  /**
   * GET /tasks
   * @summary List background tasks, most recent first.
   * @operationId listTasks
   * @tags tasks - Operations of the task controller
   * @security JWT
   * @param {integer} take.query - How many tasks the endpoint should return.
   * @param {integer} skip.query - How many tasks should be skipped (pagination).
   * @param {string} status.query - Filter by status (pending, processing, completed, failed). Comma-separated for multiple.
   * @param {string} type.query - Filter by task type.
   * @return {PaginatedTaskResponse} 200 - The matching tasks.
   * @return {string} 400 - Validation error.
   * @return {string} 500 - Internal server error.
   */
  public async listTasks(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('List tasks by', req.token.user);

    let take: number;
    let skip: number;
    try {
      ({ take, skip } = parseRequestPagination(req));
    } catch (e) {
      res.status(400).send((e as Error).message);
      return;
    }

    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    let statuses: TaskStatus[] | undefined;
    if (statusParam) {
      const split = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
      const invalid = split.filter((s) => !VALID_STATUSES.has(s));
      if (invalid.length > 0) {
        res.status(400).send(`Invalid status value(s): ${invalid.join(', ')}`);
        return;
      }
      statuses = split as TaskStatus[];
    }

    const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined;

    try {
      const [tasks, count] = await TaskService.getTasks(
        { status: statuses, type: typeParam },
        { take, skip },
      );
      res.json(toResponse(tasks.map(TaskController.asTaskResponse), count, { take, skip }));
    } catch (error) {
      this.logger.error('Could not list tasks:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /tasks/{id}
   * @summary Get a single task by id.
   * @operationId getTask
   * @tags tasks - Operations of the task controller
   * @security JWT
   * @param {integer} id.path.required - The id of the task.
   * @return {TaskResponse} 200 - The requested task.
   * @return {string} 404 - Task not found.
   * @return {string} 500 - Internal server error.
   */
  public async getTask(req: RequestWithToken, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    try {
      const task = await TaskService.getTask(id);
      if (!task) {
        res.status(404).send('Task not found.');
        return;
      }
      res.json(TaskController.asTaskResponse(task));
    } catch (error) {
      this.logger.error('Could not load task:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /tasks/{id}/retry
   * @summary Reset a failed task so it gets picked up again.
   * @operationId retryTask
   * @tags tasks - Operations of the task controller
   * @security JWT
   * @param {integer} id.path.required - The id of the task to retry.
   * @return {TaskResponse} 200 - The updated task.
   * @return {string} 400 - The task was not in a retryable state.
   * @return {string} 404 - Task not found.
   * @return {string} 500 - Internal server error.
   */
  public async retryTask(req: RequestWithToken, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    try {
      const task = await TaskService.retry(id);
      if (!task) {
        res.status(404).send('Task not found.');
        return;
      }
      res.json(TaskController.asTaskResponse(task));
    } catch (error) {
      const message = (error as Error)?.message ?? 'Internal server error.';
      if (message.includes('not in failed state')) {
        res.status(400).send(message);
        return;
      }
      this.logger.error('Could not retry task:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /tasks/stats
   * @summary Aggregate counts of tasks by status.
   * @operationId getTaskStats
   * @tags tasks - Operations of the task controller
   * @security JWT
   * @return {TaskStatsResponse} 200 - Status counts.
   * @return {string} 500 - Internal server error.
   */
  public async getStats(req: RequestWithToken, res: Response): Promise<void> {
    try {
      res.json(await TaskService.getStats());
    } catch (error) {
      this.logger.error('Could not get task stats:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
