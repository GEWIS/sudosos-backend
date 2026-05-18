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

import sinon from 'sinon';
import nodemailer, { Transporter } from 'nodemailer';
import { Queue, Worker } from 'bullmq';
import { registerAllTasks } from '../src/tasks';
import TaskService from '../src/service/task-service';
import Task from '../src/entity/task';

/**
 * Object containing all global stubs that are set before each test case.
 * Note that these stubs are reinitialized before each test case.
 * Therefore, if you wish to restore these stubs to create your own,
 * ensure that you restore them before each test case.
 */
export let rootStubs: {
  /**
   * Mail stub, which mocks a new SMTP connection.
   */
  mail: sinon.SinonStub;
  queueAdd: sinon.SinonStub;
} | undefined;

beforeAll(() => {
  sinon.stub(Queue.prototype, 'on').returns({} as any);
  sinon.stub(Worker.prototype, 'on').returns({} as any);

  Object.defineProperty(Queue.prototype, 'client', {
    get: () => Promise.resolve({}),
    configurable: true,
  });

  // Register production task handlers globally. Tests that need to swap
  // handlers can reset the registry and restore it via registerAllTasks() in
  // their own teardown.
  registerAllTasks();
});

beforeEach(async () => {
  const sendMailSpy = sinon.spy();
  const mailStub = sinon.stub(nodemailer, 'createTransport').returns({
    sendMail: sendMailSpy,
  } as any as Transporter);

  let queueAddStub: sinon.SinonStub;
  if ((Queue.prototype.add as any).restore) {
    queueAddStub = Queue.prototype.add as sinon.SinonStub;
  } else {
    queueAddStub = sinon.stub(Queue.prototype, 'add').resolves({ id: 'mock-id' } as any);
  }

  queueAddStub.resetHistory();

  // Bring TaskService up fresh per test with a fake Redis connection. The
  // BullMQ Queue prototype is fully stubbed in beforeAll, so the fake
  // connection is never actually used -- it just lets tests assert that
  // `Queue.prototype.add` was called by the dispatch path.
  TaskService.init({} as any);

  // Drop any task rows that earlier tests may have created so each test
  // starts with an empty queue. Skipped when the DB is not yet initialised
  // (some unit tests run without a real connection).
  try {
    await Task.createQueryBuilder().delete().execute();
  } catch {
    // No DB / table yet; ignore.
  }

  rootStubs = {
    mail: mailStub,
    queueAdd: queueAddStub,
  };
});

afterEach(() => {
  rootStubs?.mail.restore();
  rootStubs = undefined;
});

afterAll(() => {
  sinon.restore();
});
