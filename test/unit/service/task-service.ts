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

import { DataSource } from 'typeorm';
import { expect } from 'chai';
import TaskService from '../../../src/service/task-service';
import Task, { TaskStatus } from '../../../src/entity/task';
import { taskRegistry } from '../../../src/tasks/task-registry';
import { registerAllTasks } from '../../../src/tasks';
import { defaultBefore, finishTestDB } from '../../helpers/test-helpers';

const TEST_TASK_TYPE = 'test-task';

describe('TaskService', () => {
  let ctx: { connection: DataSource };

  beforeAll(async () => {
    ctx = (await defaultBefore()) as any;
    // TaskService.init is set up by root-hooks per test.
  });

  afterAll(async () => {
    TaskService.reset();
    // Leave the registry in the same shape root-hooks set it up in, so test
    // files that run after us see the production handlers again.
    taskRegistry.reset();
    registerAllTasks();
    await finishTestDB(ctx.connection);
  });

  beforeEach(async () => {
    taskRegistry.reset();
    await Task.createQueryBuilder().delete().execute();
  });

  describe('dispatch', () => {
    it('rejects unknown task types', async () => {
      await expect(TaskService.dispatch('does-not-exist', {})).to.be.rejectedWith(
        /No handler registered/,
      );
    });

    it('persists a pending row when the type is registered', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      const task = await TaskService.dispatch(TEST_TASK_TYPE, { hello: 'world' });
      const row = await Task.findOne({ where: { id: task.id } });
      expect(row).to.not.be.null;
      expect(row!.status).to.equal(TaskStatus.PENDING);
      expect(row!.attempts).to.equal(0);
      expect(JSON.parse(row!.payload)).to.deep.equal({ hello: 'world' });
    });
  });

  describe('runTask', () => {
    it('marks the task completed when the handler succeeds', async () => {
      let received: unknown = null;
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async (p: unknown) => {
          received = p;
        },
      });
      const task = await TaskService.dispatch(TEST_TASK_TYPE, { v: 42 });
      await TaskService.runTask(task.id);
      const row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.COMPLETED);
      expect(row!.attempts).to.equal(1);
      expect(row!.completedAt).to.not.be.null;
      expect(received).to.deep.equal({ v: 42 });
    });

    it('marks the task failed once max attempts are exhausted', async () => {
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => {
          throw new Error('boom');
        },
      });
      const task = await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 2 });

      await TaskService.runTask(task.id); // attempt 1 -> still pending with backoff
      let row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.PENDING);
      expect(row!.attempts).to.equal(1);
      expect(row!.availableAt).to.be.instanceOf(Date);
      expect(row!.lastError).to.equal('boom');

      // Clear backoff so we can run immediately.
      row!.availableAt = null;
      await row!.save();

      await TaskService.runTask(task.id); // attempt 2 -> exhausted
      row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.FAILED);
      expect(row!.attempts).to.equal(2);
      expect(row!.lastError).to.equal('boom');
    });

    it('does not re-run terminal tasks', async () => {
      let calls = 0;
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => {
          calls += 1;
        },
      });
      const task = await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.runTask(task.id);
      await TaskService.runTask(task.id);
      expect(calls).to.equal(1);
    });

    it('marks failed when no handler is registered for a stored type', async () => {
      // Insert directly to bypass the dispatch guard.
      const task = await Task.save({
        type: 'unknown-type',
        payload: '{}',
        status: TaskStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
      } as Task);
      await TaskService.runTask(task.id);
      const row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.FAILED);
      expect(row!.lastError).to.contain('No handler registered');
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => {
          throw new Error('still broken');
        },
      });
    });

    it('resets a failed task to pending', async () => {
      const task = await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 1 });
      await TaskService.runTask(task.id);
      let row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.FAILED);

      await TaskService.retry(task.id);
      row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.PENDING);
      expect(row!.attempts).to.equal(0);
      expect(row!.lastError).to.be.null;
      expect(row!.availableAt).to.be.null;
    });

    it('refuses to retry non-failed tasks', async () => {
      const task = await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 5 });
      await expect(TaskService.retry(task.id)).to.be.rejectedWith(/not in failed state/);
    });

    it('returns null when the task does not exist', async () => {
      const result = await TaskService.retry(9_999_999);
      expect(result).to.be.null;
    });
  });

  describe('processNextTask', () => {
    it('runs the oldest pending task and skips not-yet-available ones', async () => {
      const handled: number[] = [];
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async (p: { id: number }) => {
          handled.push(p.id);
        },
      });

      const future = new Date(Date.now() + 60_000);
      await TaskService.dispatch(TEST_TASK_TYPE, { id: 1 }, { availableAt: future });
      await TaskService.dispatch(TEST_TASK_TYPE, { id: 2 });

      const ran = await TaskService.processNextTask();
      expect(ran).to.not.be.null;
      expect(JSON.parse(ran!.payload)).to.deep.equal({ id: 2 });
      expect(handled).to.deep.equal([2]);
    });

    it('returns null when there is no eligible task', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      const ran = await TaskService.processNextTask();
      expect(ran).to.be.null;
    });
  });

  describe('getStats', () => {
    it('reports counts grouped by status', async () => {
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => {
          throw new Error('nope');
        },
      });
      const failingTask = await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 1 });
      await TaskService.runTask(failingTask.id);

      taskRegistry.reset();
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      const completedTask = await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.runTask(completedTask.id);

      await TaskService.dispatch(TEST_TASK_TYPE, {});

      const stats = await TaskService.getStats();
      expect(stats.pending).to.equal(1);
      expect(stats.completed).to.equal(1);
      expect(stats.failed).to.equal(1);
      expect(stats.processing).to.equal(0);
    });
  });

  describe('getTasks', () => {
    it('filters by status', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      const completedTask = await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.runTask(completedTask.id);
      await TaskService.dispatch(TEST_TASK_TYPE, {});

      const [pending, pendingCount] = await TaskService.getTasks(
        { status: [TaskStatus.PENDING] },
        { take: 10, skip: 0 },
      );
      expect(pendingCount).to.equal(1);
      expect(pending).to.have.lengthOf(1);
      expect(pending[0].status).to.equal(TaskStatus.PENDING);

      const [completed, completedCount] = await TaskService.getTasks(
        { status: [TaskStatus.COMPLETED] },
        { take: 10, skip: 0 },
      );
      expect(completedCount).to.equal(1);
      expect(completed[0].status).to.equal(TaskStatus.COMPLETED);
    });
  });
});
