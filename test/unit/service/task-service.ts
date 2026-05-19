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
import dinero from 'dinero.js';

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

    it('rejects invalid maximum attempt counts', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      await expect(
        TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 0 }),
      ).to.be.rejectedWith(/positive integer/);
      await expect(
        TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 1.5 }),
      ).to.be.rejectedWith(/positive integer/);
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
      await TaskService.processNextEligible();
      const row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.COMPLETED);
      expect(row!.attempts).to.equal(1);
      expect(row!.completedAt).to.not.be.null;
      expect(row!.payload).to.equal('null');
      expect(received).to.deep.equal({ v: 42 });
    });

    it('preserves dates and monetary values in the stored payload', async () => {
      let received: {
        at: Date;
        amount: ReturnType<typeof dinero>;
      } | undefined;
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async (payload: typeof received) => {
          received = payload;
        },
      });
      const at = new Date('2026-07-31T08:00:00.000Z');
      await TaskService.dispatch(TEST_TASK_TYPE, {
        at,
        amount: dinero({ amount: 1234, currency: 'EUR', precision: 2 }),
      });

      await TaskService.processNextEligible();

      expect(received!.at).to.be.instanceOf(Date);
      expect(received!.at.toISOString()).to.equal(at.toISOString());
      expect(received!.amount.getAmount()).to.equal(1234);
      expect(received!.amount.getCurrency()).to.equal('EUR');
    });

    it('leaves unknown tagged payload values unchanged', async () => {
      let received: unknown;
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async (payload: unknown) => {
          received = payload;
        },
      });
      const tagged = { __sudososTaskValue: 'future-type', value: 'untouched' };

      await TaskService.dispatch(TEST_TASK_TYPE, tagged);
      await TaskService.processNextEligible();

      expect(received).to.deep.equal(tagged);
    });

    it('marks the task failed once max attempts are exhausted', async () => {
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => {
          throw new Error('boom');
        },
      });
      const task = await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 2 });

      await TaskService.processNextEligible(); // attempt 1 -> still pending with backoff
      let row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.PENDING);
      expect(row!.attempts).to.equal(1);
      expect(row!.availableAt).to.be.instanceOf(Date);
      expect(row!.lastError).to.equal('boom');

      // Clear backoff so we can run immediately.
      row!.availableAt = null;
      await row!.save();

      await TaskService.processNextEligible(); // attempt 2 -> exhausted
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
      await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.processNextEligible();
      await TaskService.processNextEligible();
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
      await TaskService.processNextEligible();
      const row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.FAILED);
      expect(row!.lastError).to.contain('No handler registered');
    });

    it('marks malformed stored payloads as permanently failed', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      const task = await Task.save({
        type: TEST_TASK_TYPE,
        payload: '{invalid-json',
        status: TaskStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
      } as Task);

      await TaskService.processNextEligible();

      const row = await Task.findOne({ where: { id: task.id } });
      expect(row!.status).to.equal(TaskStatus.FAILED);
      expect(row!.lastError).to.contain('Could not parse payload');
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
      await TaskService.processNextEligible();
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

  describe('processNextEligible', () => {
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

      const ran = await TaskService.processNextEligible();
      expect(ran).to.be.true;
      expect(handled).to.deep.equal([2]);
    });

    it('returns false when there is no eligible task', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      const ran = await TaskService.processNextEligible();
      expect(ran).to.be.false;
    });
  });

  describe('claim', () => {
    it('does not double-claim a pending task when two callers race', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      await TaskService.dispatch(TEST_TASK_TYPE, {});

      const [a, b] = await Promise.all([
        TaskService.claim(),
        TaskService.claim(),
      ]);

      const winners = [a, b].filter((t) => t !== null);
      const losers = [a, b].filter((t) => t === null);
      expect(winners).to.have.lengthOf(1);
      expect(losers).to.have.lengthOf(1);
      expect(winners[0]!.status).to.equal(TaskStatus.PROCESSING);
      expect(winners[0]!.attempts).to.equal(1);
      expect(winners[0]!.lockedBy).to.equal('inline-worker');
      expect(winners[0]!.lockedUntil).to.be.instanceOf(Date);
    });

    it('claims different rows when workers race and multiple tasks are pending', async () => {
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      await TaskService.dispatch(TEST_TASK_TYPE, { id: 1 });
      await TaskService.dispatch(TEST_TASK_TYPE, { id: 2 });

      const [first, second] = await Promise.all([
        TaskService.claim('worker-a'),
        TaskService.claim('worker-b'),
      ]);

      expect(first).to.not.be.null;
      expect(second).to.not.be.null;
      expect(first!.id).to.not.equal(second!.id);
      expect(new Set([first!.lockedBy, second!.lockedBy])).to.deep.equal(
        new Set(['worker-a', 'worker-b']),
      );
    });

    it('rejects invalid lease durations', async () => {
      await expect(
        TaskService.claim('worker', new Date(), 0),
      ).to.be.rejectedWith(/leaseMs/);
    });

    it('renews an active lease and does not overwrite a new owner', async () => {
      let releaseHandler: (() => void) | undefined;
      let markStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseHandler = resolve;
      });
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => {
          markStarted!();
          await release;
        },
      });
      const task = await TaskService.dispatch(TEST_TASK_TYPE, {});

      const processing = TaskService.processNextEligible('worker-a', 30);
      await started;
      const initialLease = (await Task.findOneByOrFail({ id: task.id })).lockedUntil!;
      await new Promise(resolve => setTimeout(resolve, 15));
      const renewedLease = (await Task.findOneByOrFail({ id: task.id })).lockedUntil!;
      expect(renewedLease.getTime()).to.be.greaterThan(initialLease.getTime());

      await Task.update({ id: task.id }, { lockedBy: 'worker-b' });
      await new Promise(resolve => setTimeout(resolve, 15));
      releaseHandler!();
      await processing;

      const row = await Task.findOneByOrFail({ id: task.id });
      expect(row.status).to.equal(TaskStatus.PROCESSING);
      expect(row.lockedBy).to.equal('worker-b');
    });
  });

  describe('task registry', () => {
    it('rejects duplicate handler registration', () => {
      const handler = { type: TEST_TASK_TYPE, handle: async () => { return; } };
      taskRegistry.register(handler);
      expect(() => taskRegistry.register(handler)).to.throw(/already registered/);
    });
  });

  describe('recoverStaleTasks', () => {
    it('requeues expired leases and fails exhausted tasks', async () => {
      const now = new Date();
      const expired = new Date(now.getTime() - 1000);
      const active = new Date(now.getTime() + 60_000);
      const [retryable, exhausted, inFlight] = await Task.save([
        {
          type: TEST_TASK_TYPE,
          payload: '{}',
          status: TaskStatus.PROCESSING,
          attempts: 1,
          maxAttempts: 3,
          lockedBy: 'dead-worker',
          lockedUntil: expired,
        },
        {
          type: TEST_TASK_TYPE,
          payload: '{}',
          status: TaskStatus.PROCESSING,
          attempts: 2,
          maxAttempts: 2,
          lockedBy: 'dead-worker',
          lockedUntil: expired,
        },
        {
          type: TEST_TASK_TYPE,
          payload: '{}',
          status: TaskStatus.PROCESSING,
          attempts: 1,
          maxAttempts: 3,
          lockedBy: 'live-worker',
          lockedUntil: active,
        },
      ] as Task[]);

      const recovered = await TaskService.recoverStaleTasks(now);

      expect(recovered).to.equal(2);
      expect((await Task.findOneByOrFail({ id: retryable.id })).status)
        .to.equal(TaskStatus.PENDING);
      expect((await Task.findOneByOrFail({ id: exhausted.id })).status)
        .to.equal(TaskStatus.FAILED);
      expect((await Task.findOneByOrFail({ id: inFlight.id })).status)
        .to.equal(TaskStatus.PROCESSING);
    });

    it('recovers legacy processing rows without lease metadata', async () => {
      const task = await Task.save({
        type: TEST_TASK_TYPE,
        payload: '{}',
        status: TaskStatus.PROCESSING,
        attempts: 1,
        maxAttempts: 3,
        lockedBy: null,
        lockedUntil: null,
      } as Task);

      expect(await TaskService.recoverStaleTasks()).to.equal(1);
      expect((await Task.findOneByOrFail({ id: task.id })).status)
        .to.equal(TaskStatus.PENDING);
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
      await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 1 });
      await TaskService.processNextEligible();

      taskRegistry.reset();
      taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
      await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.processNextEligible();

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
      await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.processNextEligible();
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
