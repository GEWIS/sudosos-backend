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

import { expect } from 'chai';
import sinon, { SinonSandbox } from 'sinon';
import TaskService from '../../../src/service/task-service';
import { startTaskRunner } from '../../../src/workers/task-runner';

const waitUntil = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for worker loop.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('task-runner', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('runs the configured worker loops and performs lease recovery', async () => {
    const recover = sandbox.stub(TaskService, 'recoverStaleTasks').resolves(0);
    const processNext = sandbox.stub(TaskService, 'processNextEligible').resolves(false);

    const runner = startTaskRunner({
      concurrency: 3,
      idleMs: 1000,
      leaseMs: 5000,
      recoveryIntervalMs: 5000,
    });
    await waitUntil(() => processNext.callCount >= 3);
    await runner.stop();

    expect(runner.concurrency).to.equal(3);
    expect(recover.calledOnce).to.be.true;
    expect(processNext.callCount).to.be.at.least(3);
    expect(processNext.getCalls().every((call) => call.args[1] === 5000)).to.be.true;
  });

  it('keeps running after an iteration fails', async () => {
    sandbox.stub(TaskService, 'recoverStaleTasks').resolves(0);
    const processNext = sandbox.stub(TaskService, 'processNextEligible');
    processNext.onFirstCall().rejects(new Error('database unavailable'));
    processNext.resolves(false);

    const runner = startTaskRunner({ concurrency: 1, idleMs: 5 });
    await waitUntil(() => processNext.callCount >= 2);
    await runner.stop();

    expect(processNext.callCount).to.be.at.least(2);
  });

  it('wakes idle workers when stopped', async () => {
    sandbox.stub(TaskService, 'recoverStaleTasks').resolves(0);
    const processNext = sandbox.stub(TaskService, 'processNextEligible').resolves(false);

    const runner = startTaskRunner({ concurrency: 1, idleMs: 10_000 });
    await waitUntil(() => processNext.calledOnce);

    const stopped = await Promise.race([
      runner.stop().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    expect(stopped).to.be.true;
  });

  it('rejects invalid runner options', () => {
    expect(() => startTaskRunner({ concurrency: 0 })).to.throw(/concurrency/);
    expect(() => startTaskRunner({ idleMs: 0 })).to.throw(/idleMs/);
    expect(() => startTaskRunner({ leaseMs: Number.NaN })).to.throw(/leaseMs/);
    expect(() => startTaskRunner({ recoveryIntervalMs: -1 })).to.throw(/recoveryIntervalMs/);
  });
});
