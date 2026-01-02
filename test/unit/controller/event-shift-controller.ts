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

import express, { Application } from 'express';
import { DataSource } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import EventShift from '../../../src/entity/event/event-shift';
import EventShiftAnswer from '../../../src/entity/event/event-shift-answer';
import AssignedRole from '../../../src/entity/rbac/assigned-role';
import Database from '../../../src/database/database';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import fileUpload from 'express-fileupload';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import { expect, request } from 'chai';
import {
  EventPlanningSelectedCount,
  EventShiftResponse,
  PaginatedEventShiftResponse,
} from '../../../src/controller/response/event-response';
import { EventShiftRequest } from '../../../src/controller/request/event-request';
import EventShiftController from '../../../src/controller/event-shift-controller';
import { describe } from 'mocha';
import Event, { EventType } from '../../../src/entity/event/event';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import Role from '../../../src/entity/rbac/role';
import { EventSeeder, RbacSeeder, UserSeeder } from '../../seed';

describe('EventShiftController', () => {
  let ctx: {
    connection: DataSource,
    app: Application
    specification: SwaggerSpecification,
    controller: EventShiftController,
    adminUser: User,
    localUser: User,
    adminToken: string;
    userToken: string;
    users: User[],
    events: Event[],
    eventShifts: EventShift[],
    eventShiftAnswers: EventShiftAnswer[],
    roles: AssignedRole[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    // create dummy users
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

    const users = await new UserSeeder().seed();
    const { roleAssignments, events, eventShifts, eventShiftAnswers } = await new EventSeeder().seed(users);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { all: new Set<string>(['*']) };
    const accessRoles = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        Event: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
        EventAnswer: {
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }, {
      name: 'User',
      permissions: {
        Event: {
          get: own,
        },
        EventAnswer: {
          update: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    }]);
    const roleManager = await new RoleManager().initialize();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(adminUser, accessRoles), 'nonce admin');
    const userToken = await tokenHandler.signToken(await new RbacSeeder().getToken(localUser), 'nonce');

    const controller = new EventShiftController({ specification, roleManager });
    app.use(json());
    app.use(fileUpload());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/eventshifts', controller.getRouter());

    ctx = {
      connection,
      app,
      controller,
      specification,
      adminUser,
      localUser,
      adminToken,
      userToken,
      users,
      events,
      eventShifts,
      eventShiftAnswers,
      roles: roleAssignments,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /eventshifts', () => {
    it('should correctly return list of events', async () => {
      const res = await request(ctx.app)
        .get('/eventshifts')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as EventShiftResponse[];
      const validation = ctx.specification.validateModel('PaginatedEventShiftResponse', res.body, false, true);
      expect(validation.valid).to.be.true;

      expect(records.length).to.be.at.most(res.body._pagination.take);
    });
    it('should adhere to pagination', async () => {
      const take = 3;
      const skip = 1;
      const response = await request(ctx.app)
        .get('/eventshifts')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const shifts = response.body as PaginatedEventShiftResponse;
      expect(shifts.records.length).to.equal(take);
      expect(shifts._pagination.take).to.equal(take);
      expect(shifts._pagination.skip).to.equal(skip);
      expect(shifts._pagination.count).to
        .equal(ctx.eventShifts.filter((s) => s.deletedAt == null).length);
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/eventshifts')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('POST /eventshifts', () => {
    let req: EventShiftRequest;

    before(() => {
      req = {
        name: 'Zitten',
        roles: ['BAC', 'Bestuur'],
      };
    });

    it('should correctly create shift', async () => {
      const res = await request(ctx.app)
        .post('/eventshifts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.equal(200);

      const shiftResponse = res.body as EventShiftResponse;

      const validation = ctx.specification.validateModel('EventShiftResponse', shiftResponse, false, true);
      expect(validation.valid).to.be.true;

      expect(shiftResponse.name).to.equal(req.name);
      expect(shiftResponse.roles).to.deep.equalInAnyOrder(req.roles);

      // Cleanup
      await EventShiftAnswer.delete({ eventId: shiftResponse.id });
      await EventShift.delete(shiftResponse.id);
    });
    it('should return 400 if empty name', async () => {
      const res = await request(ctx.app)
        .post('/eventshifts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          name: '',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid shift.');
    });
    it('should return 400 if roles is not a list', async () => {
      const res = await request(ctx.app)
        .post('/eventshifts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          roles: 'Role1',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid shift.');
    });
    it('should return 200 if roles is an empty list', async () => {
      const res = await request(ctx.app)
        .post('/eventshifts')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          roles: [],
        });
      expect(res.status).to.equal(200);

      const shiftResponse = res.body as EventShiftResponse;

      const validation = ctx.specification.validateModel('EventShiftResponse', shiftResponse, false, true);
      expect(validation.valid).to.be.true;

      // Cleanup
      await EventShiftAnswer.delete({ eventId: shiftResponse.id });
      await EventShift.delete(shiftResponse.id);
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/eventshifts')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('PATCH /eventshifts/{id}', () => {
    let req: Partial<EventShiftRequest>;
    let originalShift: EventShift;
    let newRole: Role;

    before(async () => {
      newRole = await Role.save({
        name: 'Oud-BAC',
      });
      req = {
        name: 'Penningmeesteren',
        roles: [newRole.name],
      };

      originalShift = await EventShift.findOne({ where: { id: ctx.eventShifts[0].id } });
    });

    after(async () => {
      await originalShift.save();
      await Role.delete(newRole.id);
    });

    it('should correctly update shift', async () => {
      const res = await request(ctx.app)
        .patch(`/eventshifts/${originalShift.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.equal(200);

      const shiftResponse = res.body as EventShiftResponse;

      const validation = ctx.specification.validateModel('EventShiftResponse', shiftResponse, false, true);
      expect(validation.valid).to.be.true;

      expect(shiftResponse.name).to.equal(req.name);
      expect(shiftResponse.roles).to.deep.equalInAnyOrder(req.roles);
    });
    it('should return 400 if empty name', async () => {
      const res = await request(ctx.app)
        .patch(`/eventshifts/${originalShift.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          name: '',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid shift.');
    });
    it('should return 400 if roles is not a list', async () => {
      const res = await request(ctx.app)
        .patch(`/eventshifts/${originalShift.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          roles: 'Role1',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid shift.');
    });
    it('should return 200 if roles is an empty list', async () => {
      const res = await request(ctx.app)
        .patch(`/eventshifts/${originalShift.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          roles: [],
        });
      expect(res.status).to.equal(200);

      const shiftResponse = res.body as EventShiftResponse;

      const validation = ctx.specification.validateModel('EventShiftResponse', shiftResponse, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .patch(`/eventshifts/${originalShift.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('GET /eventshifts/{id}/counts', () => {
    let answersSelected: EventShiftAnswer[];

    before(async () => {
      expect(await EventShiftAnswer.count({ where: { selected: true } })).to.equal(0);

      const users = Array.from(new Set(ctx.eventShiftAnswers.map((a) => a.userId))).slice(0, 2);

      const answers = ctx.eventShiftAnswers.filter((a) => users.includes(a.userId));
      answersSelected = await Promise.all(answers.map(async (a) => {
        a.selected = true;
        return a.save();
      }));
    });

    after(async () => {
      await Promise.all(answersSelected.map(async (a) => {
        a.selected = false;
        return a.save();
      }));
      expect(await EventShiftAnswer.count({ where: { selected: true } })).to.equal(0);
    });

    it('should correctly give the number of times a user is selected for a shift', async () => {
      const shiftsIds = Array.from(new Set(answersSelected.map((a) => a.shiftId)));

      await Promise.all(shiftsIds.map(async (shiftId) => {
        const shiftAnswers = answersSelected.filter((a) => a.shiftId === shiftId);
        const userIds = Array.from(new Set(shiftAnswers.map((a) => a.userId)));
        const res = await request(ctx.app)
          .get(`/eventshifts/${shiftId}/counts`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);
        expect(res.status).to.equal(200);

        const counts = res.body as EventPlanningSelectedCount[];

        expect(counts.length).to.equal(userIds.length);
        counts.forEach((c) => {
          const validation = ctx.specification.validateModel('EventPlanningSelectedCount', c, false, true);
          expect(validation.valid).to.be.true;
          expect(c.count).to.equal(shiftAnswers.filter((a)  => a.userId === c.id).length);
        });
      }));
    });
    it('should correctly only account for certain event types', async () => {
      const event = ctx.events[0];
      await Event.update(event.id, {
        type: EventType.OTHER,
      });

      const shiftsIds = Array.from(new Set(answersSelected
        .filter((a) => a.eventId === event.id)
        .map((a) => a.shiftId)));
      expect(shiftsIds.length).to.be.at.least(1);

      const eventType = EventType.OTHER;
      await Promise.all(shiftsIds.map(async (shiftId) => {
        const res = await request(ctx.app)
          .get(`/eventshifts/${shiftId}/counts`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({ eventType });
        expect(res.status).to.equal(200);

        const counts = res.body as EventPlanningSelectedCount[];
        counts.forEach((c) => {
          expect(c.count).to.equal(1);
        });
      }));

      // Cleanup
      await Event.update(event.id, {
        type: event.type,
      });
    });
    it('should correctly only account for event after a certain date', async () => {
      const events = answersSelected
        .map((a) => a.event)
        .filter((e, i, all) => all.findIndex((e2) => e2.id === e.id) === i)
        .sort((e1, e2) => e2.startDate.getTime() - e1.startDate.getTime());

      const shiftsIds = Array.from(new Set(answersSelected
        .filter((a) => a.eventId === events[0].id)
        .map((a) => a.shiftId)));
      expect(shiftsIds.length).to.be.at.least(1);

      const afterDate = new Date(events[0].startDate.getTime() - 1000);
      await Promise.all(shiftsIds.map(async (shiftId) => {
        const res = await request(ctx.app)
          .get(`/eventshifts/${shiftId}/counts`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({ afterDate });
        expect(res.status).to.equal(200);

        const counts = res.body as EventPlanningSelectedCount[];
        counts.forEach((c) => {
          expect(c.count).to.equal(1);
        });
      }));
    });
    it('should correctly only account for event before a certain date', async () => {
      const events = answersSelected
        .map((a) => a.event)
        .filter((e, i, all) => all.findIndex((e2) => e2.id === e.id) === i)
        .sort((e1, e2) => e1.startDate.getTime() - e2.startDate.getTime());

      const shiftsIds = Array.from(new Set(answersSelected
        .filter((a) => a.eventId === events[0].id)
        .map((a) => a.shiftId)));
      expect(shiftsIds.length).to.be.at.least(1);

      const beforeDate = new Date(events[0].startDate.getTime() + 1000);
      await Promise.all(shiftsIds.map(async (shiftId) => {
        const res = await request(ctx.app)
          .get(`/eventshifts/${shiftId}/counts`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .query({ beforeDate });
        expect(res.status).to.equal(200);

        const counts = res.body as EventPlanningSelectedCount[];
        counts.forEach((c) => {
          expect(c.count).to.equal(1);
        });
      }));
    });
    it('should return 404 if shift does not exist', async () => {
      const res = await request(ctx.app)
        .get('/eventshifts/999999/counts')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.be.empty;
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get(`/eventshifts/${ctx.eventShifts[0].id}/counts`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('DELETE /eventshifts/{id}', () => {
    it('should correctly delete single shift', async () => {
      const event = ctx.eventShifts[0];
      const res = await request(ctx.app)
        .delete(`/eventshifts/${event.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      expect(await EventShift.findOne({ where: { id: event.id } })).to.be.null;
    });
    it('should return 404 if event does not exist', async () => {
      const res = await request(ctx.app)
        .delete('/eventshifts/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.be.empty;
    });
    it('should return 403 if not admin', async () => {
      const event = ctx.eventShifts[0];
      const res = await request(ctx.app)
        .delete(`/eventshifts/${event.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });
});
