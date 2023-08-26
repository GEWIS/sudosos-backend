/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import express, { Application } from 'express';
import { Connection } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import EventController from '../../../src/controller/event-controller';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Event from '../../../src/entity/event/event';
import EventShift from '../../../src/entity/event/event-shift';
import EventShiftAnswer from '../../../src/entity/event/event-shift-answer';
import AssignedRole from '../../../src/entity/roles/assigned-role';
import Database from '../../../src/database/database';
import { seedEvents, seedRoles, seedUsers } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import fileUpload from 'express-fileupload';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import { expect, request } from 'chai';
import { BaseEventResponse, EventResponse } from '../../../src/controller/response/event-response';
import EventService from '../../../src/service/event-service';
import { UpdateEventRequest } from '../../../src/controller/request/event-request';

describe('EventController', () => {
  let ctx: {
    connection: Connection,
    app: Application
    specification: SwaggerSpecification,
    controller: EventController,
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

    const users = await seedUsers();
    const roles = await seedRoles(users);
    const { events, eventShifts, eventShiftAnswers } = await seedEvents(roles);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const userToken = await tokenHandler.signToken({ user: localUser, roles: [], lesser: false }, 'nonce');

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
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
    });
    roleManager.registerRole({
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
    });

    const controller = new EventController({ specification, roleManager });
    app.use(json());
    app.use(fileUpload());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/events', controller.getRouter());

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
      roles,
    };
  });

  after(async () => {
    await ctx.connection.destroy();
  });

  describe('GET /events', () => {
    it('should correctly return list of events', async () => {
      const res = await request(ctx.app)
        .get('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as BaseEventResponse[];
      const validation = ctx.specification.validateModel('PaginatedBaseEventResponse', records, false, true);
      expect(validation.valid).to.be.true;

      expect(records.length).to.be.at.most(res.body._pagination.take);
    });
    it('should get events based on fuzzy search on name', async () => {
      const name = ctx.events[0].name.substring(0, 3);

      const res = await request(ctx.app)
        .get('/events')
        .query({ name })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as BaseEventResponse[];
      records.forEach((e) => {
        expect(e.name).to.include(name);
      });
    });
    it('should get all events when fuzzy search on empty name', async () => {
      const name = '';

      const res = await request(ctx.app)
        .get('/events')
        .query({ name })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as BaseEventResponse[];
      expect(records.length).to.equal(ctx.events.length);
    });
    it('should get events created by user', async () => {
      const createdById = ctx.events[0].createdBy.id;

      const res = await request(ctx.app)
        .get('/events')
        .query({ createdById })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as BaseEventResponse[];
      records.forEach((e) => {
        expect(e.createdBy.id).to.equal(createdById);
      });
    });
    it('should get events before date', async () => {
      const beforeDate = new Date('2020-07-01');

      const res = await request(ctx.app)
        .get('/events')
        .query({ beforeDate })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as BaseEventResponse[];
      records.forEach((e) => {
        expect(new Date(e.startDate)).to.be.at.most(beforeDate);
      });
    });
    it('should get events after date', async () => {
      const afterDate = new Date('2020-07-01');

      const res = await request(ctx.app)
        .get('/events')
        .query({ afterDate })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const records = res.body.records as BaseEventResponse[];
      records.forEach((e) => {
        expect(new Date(e.startDate)).to.be.at.least(afterDate);
      });
    });
    it('should adhere to pagination', async () => {
      const take = 3;
      const skip = 1;
      const events = await EventService.getEvents({}, { take, skip });
      expect(events.records.length).to.equal(take);
      expect(events._pagination.take).to.equal(take);
      expect(events._pagination.skip).to.equal(skip);
      expect(events._pagination.count).to.equal(ctx.events.length);

      const ids = ctx.events
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
        .slice(skip, skip + take)
        .map((e) => e.id);
      events.records.forEach((event, i) => {
        expect(event.id).to.equal(ids[i]);
      });
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/events')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('GET /events/{id}', () => {
    it('should correctly return single event', async () => {
      const event = ctx.events[0];
      const res = await request(ctx.app)
        .get(`/events/${event.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);

      const eventResponse = res.body as EventResponse;

      const validation = ctx.specification.validateModel('EventResponse', eventResponse, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should return 404 if event does not exist', async () => {
      const res = await request(ctx.app)
        .get('/events/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.be.empty;
    });
    it('should return 403 if not admin', async () => {
      const event = ctx.events[0];
      const res = await request(ctx.app)
        .get(`/events/${event.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('POST /events', () => {
    let req: UpdateEventRequest;

    before(() => {
      req = {
        name: 'Vergadering',
        startDate: new Date(new Date().getTime() + 1000 * 60 * 60).toISOString(),
        endDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 4).toISOString(),
        shiftIds: ctx.eventShifts.slice(1, 3).map((s) => s.id),
      };
    });

    it('should correctly create event', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);
      expect(res.status).to.equal(200);

      const eventResponse = res.body as EventResponse;

      const validation = ctx.specification.validateModel('EventResponse', eventResponse, false, true);
      expect(validation.valid).to.be.true;
      expect(eventResponse.createdBy.id).to.equal(ctx.adminUser.id);

      const shiftIds = new Set();
      eventResponse.answers.forEach((a) => shiftIds.add(a.shift.id));
      expect(Array.from(shiftIds)).to.deep.equalInAnyOrder(req.shiftIds);
      expect(eventResponse.name).to.equal(req.name);
      expect(eventResponse.startDate).to.equal(req.startDate);
      expect(eventResponse.endDate).to.equal(req.endDate);

      // Cleanup
      await EventShiftAnswer.delete({ eventId: eventResponse.id });
      await Event.delete(eventResponse.id);
    });
    it('should return 400 if name is empty string', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          name: '',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if startDate is invalid', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          startDate: 'hihaho',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if startDate is in the past', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          startDate: new Date('2023-08-25'),
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if endDate is invalid', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          endDate: 'hihaho',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if endDate is in the past', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          endDate: new Date('2023-08-25'),
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if endDate is before the startDate', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          startDate: new Date('2023-08-25'),
          endDate: new Date('2023-08-24'),
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if shiftIds is not an array', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          shiftIds: 'Ollie',
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if shiftIds is an empty array', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          shiftIds: [],
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if shiftIds is an array of strings', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          shiftIds: ['Ollie'],
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if shiftIds has duplicates', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          shiftIds: [1, 1],
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 if shiftIds has ids that do not exist', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          shiftIds: [1, 99999999],
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid event.');
    });
    it('should return 400 when shift has no users', async () => {
      const shift = ctx.eventShifts.find((s) => s.roles.length === 0);
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...req,
          shiftIds: [shift.id],
        });
      expect(res.status).to.equal(400);
      expect(res.body).to.equal(`Shift with ID ${shift.id} has no users. Make sure the shift's roles are correct.`);
    });
    it('should return 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/events')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('DELETE /events/{id}', () => {
    it('should correctly delete single event', async () => {
      const event = ctx.events[0];
      const res = await request(ctx.app)
        .delete(`/events/${event.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      expect(await Event.findOne({ where: { id: event.id } })).to.be.null;
    });
    it('should return 404 if event does not exist', async () => {
      const res = await request(ctx.app)
        .delete('/events/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.be.empty;
    });
    it('should return 403 if not admin', async () => {
      const event = ctx.events[0];
      const res = await request(ctx.app)
        .delete(`/events/${event.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });
});
