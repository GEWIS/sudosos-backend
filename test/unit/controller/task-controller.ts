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

import { json } from 'body-parser';
import chai from 'chai';
import express, { Application as ExpressApp } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import TokenHandler from '../../../src/authentication/token-handler';
import TaskController from '../../../src/controller/task-controller';
import TaskService from '../../../src/service/task-service';
import Task, { TaskStatus } from '../../../src/entity/task';
import { taskRegistry } from '../../../src/tasks/task-registry';
import { registerAllTasks } from '../../../src/tasks';
import Database from '../../../src/database/database';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { ensureProductionRoles, signTokenFor } from '../../helpers/user-factory';

const { expect, request } = chai;

const TEST_TASK_TYPE = 'test-task';

describe('TaskController', () => {
  let ctx: {
    connection: DataSource;
    app: ExpressApp;
    specification: SwaggerSpecification;
    adminToken: string;
    userToken: string;
  };

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;
    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;
    await User.save(adminUser);
    await User.save(localUser);

    const app = express();
    const specification = await Swagger.initialize(app);

    await ensureProductionRoles();
    const roleManager = await new RoleManager().initialize();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await signTokenFor(adminUser, tokenHandler, 'admin');
    const userToken = await signTokenFor(localUser, tokenHandler, 'user');

    // TaskService.init is set up by root-hooks per test.

    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/tasks', new TaskController({ specification, roleManager }).getRouter());

    ctx = {
      connection,
      app,
      specification,
      adminToken: adminToken as string,
      userToken: userToken as string,
    };
  });

  afterAll(async () => {
    TaskService.reset();
    taskRegistry.reset();
    registerAllTasks();
    await finishTestDB(ctx.connection);
  });

  beforeEach(async () => {
    taskRegistry.reset();
    taskRegistry.register({ type: TEST_TASK_TYPE, handle: async () => { return; } });
    await Task.createQueryBuilder().delete().execute();
  });

  describe('GET /tasks', () => {
    it('returns 403 for a non-admin user', async () => {
      const res = await request(ctx.app)
        .get('/tasks')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });

    it('returns 200 and validates the response shape', async () => {
      await TaskService.dispatch(TEST_TASK_TYPE, { a: 1 });
      const res = await request(ctx.app)
        .get('/tasks')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const validator = ctx.specification.validateModel(
        'PaginatedTaskResponse',
        res.body,
        false,
        true,
      );
      expect(validator.valid).to.be.true;
      expect(res.body.records.length).to.equal(1);
      expect(res.body.records[0].status).to.equal(TaskStatus.PENDING);
    });

    it('filters by status', async () => {
      const a = await TaskService.dispatch(TEST_TASK_TYPE, {});
      await TaskService.runTask(a.id);
      await TaskService.dispatch(TEST_TASK_TYPE, {});

      const res = await request(ctx.app)
        .get('/tasks?status=completed')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(res.body._pagination.count).to.equal(1);
      expect(res.body.records[0].status).to.equal(TaskStatus.COMPLETED);
    });

    it('rejects invalid status values', async () => {
      const res = await request(ctx.app)
        .get('/tasks?status=garbage')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns the task', async () => {
      const t = await TaskService.dispatch(TEST_TASK_TYPE, {});
      const res = await request(ctx.app)
        .get(`/tasks/${t.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.id).to.equal(t.id);
    });

    it('returns 404 for missing tasks', async () => {
      const res = await request(ctx.app)
        .get('/tasks/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /tasks/:id/retry', () => {
    it('resets a failed task and returns 200', async () => {
      taskRegistry.reset();
      taskRegistry.register({
        type: TEST_TASK_TYPE,
        handle: async () => { throw new Error('nope'); },
      });
      const t = await TaskService.dispatch(TEST_TASK_TYPE, {}, { maxAttempts: 1 });
      await TaskService.runTask(t.id);

      const res = await request(ctx.app)
        .post(`/tasks/${t.id}/retry`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal(TaskStatus.PENDING);
      expect(res.body.attempts).to.equal(0);
    });

    it('returns 400 when the task is not in failed state', async () => {
      const t = await TaskService.dispatch(TEST_TASK_TYPE, {});
      const res = await request(ctx.app)
        .post(`/tasks/${t.id}/retry`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
    });

    it('returns 403 for a non-admin user', async () => {
      const t = await TaskService.dispatch(TEST_TASK_TYPE, {});
      const res = await request(ctx.app)
        .post(`/tasks/${t.id}/retry`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /tasks/stats', () => {
    it('returns the status counts', async () => {
      await TaskService.dispatch(TEST_TASK_TYPE, {});
      const res = await request(ctx.app)
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      const validator = ctx.specification.validateModel(
        'TaskStatsResponse',
        res.body,
        false,
        true,
      );
      expect(validator.valid).to.be.true;
      expect(res.body.pending).to.equal(1);
    });
  });
});
