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
import { describe } from 'mocha';
import { Connection } from 'typeorm';
import User from '../../../src/entity/user/user';
import { seedEvents, seedRoles, seedUsers } from '../../seed';
import Event, { EventType } from '../../../src/entity/event/event';
import EventShift from '../../../src/entity/event/event-shift';
import EventShiftAnswer, { Availability } from '../../../src/entity/event/event-shift-answer';
import Database from '../../../src/database/database';
import EventService, { CreateEventParams } from '../../../src/service/event-service';
import { expect } from 'chai';
import { BaseEventResponse, BaseEventShiftResponse } from '../../../src/controller/response/event-response';
import AssignedRole from '../../../src/entity/roles/assigned-role';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import Mailer from '../../../src/mailer';
import nodemailer, { Transporter } from 'nodemailer';
import { truncateAllTables } from '../../setup';

describe('eventService', () => {
  let ctx: {
    connection: Connection,
    users: User[],
    events: Event[],
    eventShifts: EventShift[],
    deletedEventShifts: EventShift[],
    eventShiftAnswers: EventShiftAnswer[],
    roles: AssignedRole[],
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();
    const roles = await seedRoles(users);
    const { events, eventShifts: allEventShifts, eventShiftAnswers } = await seedEvents(roles);

    const eventShifts = allEventShifts.filter((s) => s.deletedAt == null);
    const deletedEventShifts = allEventShifts.filter((s) => s.deletedAt != null);

    ctx = {
      connection,
      users,
      events,
      eventShifts,
      deletedEventShifts,
      eventShiftAnswers,
      roles,
    };
  });

  const checkEvent = (actual: BaseEventResponse, expected: Event) => {
    expect(actual.id).to.equal(expected.id);
    expect(actual.createdAt).to.equal(expected.createdAt.toISOString());
    expect(actual.updatedAt).to.equal(expected.updatedAt.toISOString());
    expect(actual.startDate).to.equal(expected.startDate.toISOString());
    expect(actual.endDate).to.equal(expected.endDate.toISOString());
    expect(actual.name).to.equal(expected.name);
    expect(actual.type).to.equal(expected.type);
    expect(actual.createdBy.id).to.equal(expected.createdBy.id);
  };

  const checkEventShift = (actual: BaseEventShiftResponse, expected: EventShift) => {
    expect(actual.id).to.equal(expected.id);
    expect(actual.createdAt).to.equal(expected.createdAt.toISOString());
    expect(actual.updatedAt).to.equal(expected.updatedAt.toISOString());
    expect(actual.name).to.equal(expected.name);
  };

  after(async () => {
    await Database.finish(ctx.connection);
  });

  describe('getEvents', () => {
    it('should return all events ordered by startDate descending', async () => {
      const { records: events } = await EventService.getEvents();
      expect(events.length).be.greaterThan(0);
      expect(events.length).to.equal(ctx.events.length);

      events.forEach((e) => {
        const dbEvent = ctx.events.find((e2) => e2.id === e.id);
        expect(dbEvent).to.not.be.undefined;
        checkEvent(e, dbEvent);
      });

      const dates = events.map((e) =>  new Date(e.startDate).getTime());
      expect(dates, 'Expected startDate to be sorted in descending order').to.be.descending;
    });
    it('should filter on id', async () => {
      const id = ctx.events[0].id;
      const { records: events } = await EventService.getEvents({ id });

      expect(events.length).to.equal(1);
      expect(events[0].id).to.equal(id);
    });
    it('should filter on exact name', async () => {
      const name = ctx.events[0].name;
      const actualEvents = ctx.events.filter((e) => e.name === name);
      const { records: events } = await EventService.getEvents({ name });

      expect(actualEvents.length).to.equal(events.length);
      events.forEach((e) => {
        expect(e.name).to.equal(name);
      });
    });
    it('should filter on like name', async () => {
      const name = ctx.events[0].name.substring(0, 6);
      const actualEvents = ctx.events.filter((e) => e.name.substring(0, 6) === name);
      const { records: events } = await EventService.getEvents({ name });

      expect(actualEvents.length).to.equal(events.length);
      events.forEach((e) => {
        expect(e.name).to.include(name);
      });
    });
    it('should filter on created by ID', async () => {
      const createdById = ctx.events[0].createdBy.id;
      const { records: events } = await EventService.getEvents({ createdById });

      expect(events.length).to.equal(1);
      expect(events[0].createdBy.id).to.equal(createdById);
    });
    it('should filter on date (before)', async () => {
      const beforeDate = ctx.events[0].startDate;
      const actualEvents = ctx.events.filter((e) => e.startDate.getTime() <= beforeDate.getTime());
      const { records: events } = await EventService.getEvents({ beforeDate });

      expect(actualEvents.length).to.equal(events.length);
      const ids = actualEvents.map((e) => e.id);
      events.forEach((e) => {
        expect(ids).to.include(e.id);
        expect(new Date(e.startDate)).to.be.lessThanOrEqual(beforeDate);
      });
    });
    it('should filter on date (after)', async () => {
      const afterDate = ctx.events[0].startDate;
      const actualEvents = ctx.events.filter((e) => e.startDate.getTime() >= afterDate.getTime());
      const { records: events } = await EventService.getEvents({ afterDate });

      expect(actualEvents.length).to.equal(events.length);
      const ids = actualEvents.map((e) => e.id);
      events.forEach((e) => {
        expect(ids).to.include(e.id);
        expect(new Date(e.startDate)).to.be.greaterThanOrEqual(afterDate);
      });
    });
    it('should filter based on date range', async () => {
      const afterDate = ctx.events[0].startDate;
      const beforeDate = ctx.events[1].startDate;
      const actualEvents = ctx.events.filter((e) => e.startDate.getTime() >= afterDate.getTime() && e.startDate.getTime() <= beforeDate.getTime());
      const { records: events } = await EventService.getEvents({ beforeDate, afterDate });

      expect(actualEvents.length).to.equal(events.length);
      const ids = actualEvents.map((e) => e.id);
      events.forEach((e) => {
        expect(ids).to.include(e.id);
        expect(new Date(e.startDate)).to.be.greaterThanOrEqual(afterDate);
      });
    });
    it('should filter on createdById', async () => {
      const createdById = ctx.events[0].createdBy.id;
      const actualEvents = ctx.events.filter((e) => e.createdBy.id === createdById);
      const { records: events } = await EventService.getEvents({ createdById });

      expect(events.length).to.equal(actualEvents.length);
      const ids = actualEvents.map((e) => e.id);
      events.forEach((e) => {
        expect(ids).to.include(e.id);
        expect(e.createdBy.id).to.equal(createdById);
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
  });

  describe('getSingleEvent', () => {
    it('should return correct event', async () => {
      const actualEvent = ctx.events[0];
      const event = await EventService.getSingleEvent(actualEvent.id);

      expect(event).to.not.be.undefined;
      checkEvent(event, actualEvent);
    });
    it('should return correct event with soft deleted shift', async () => {
      const actualEvent = ctx.events.find((e) => e.answers.some((a) => a.shift.deletedAt != null));
      expect(actualEvent).to.not.be.undefined;
      const event = await EventService.getSingleEvent(actualEvent.id);

      expect(event).to.not.be.undefined;
      checkEvent(event, actualEvent);
    });
    it('should return undefined if event does not exist', async () => {
      const event = await EventService.getSingleEvent(99999999);
      expect(event).to.be.undefined;
    });
  });

  describe('sendEventPlanningReminders', () => {
    let sandbox: SinonSandbox;
    let sendMailFake: SinonSpy;

    before(() => {
      Mailer.reset();

      sandbox = sinon.createSandbox();
      sendMailFake = sandbox.spy();
      sandbox.stub(nodemailer, 'createTransport').returns({
        sendMail: sendMailFake,
      } as any as Transporter);
    });

    after(() => {
      sandbox.restore();
    });

    afterEach(() => {
      sendMailFake.resetHistory();
    });

    it('should send a reminder to all users that have not given up their availability', async () => {
      const { startDate, answers } = ctx.events[0];
      const users = Array.from(new Set(answers.filter((a) => a.availability == null).map((a) => a.user)));
      const referenceDate = new Date(startDate.getTime() - 1000 * 3600 * 24 * 2.5);

      await EventService.sendEventPlanningReminders(referenceDate);

      expect(sendMailFake.callCount).to.equal(users.length);
    });
    it('should send a reminder to events starting between two to three days when no date given', async () => {
      const event = ctx.events[0];
      const users = Array.from(new Set(event.answers.filter((a) => a.availability == null).map((a) => a.user)));
      // Add a second to the two days to account for running time of the test case
      const startDate = new Date(new Date().getTime() + 1000 * 3600 * 24 * 2.5);
      await EventService.updateEvent(event.id, {
        startDate,
      });

      await EventService.sendEventPlanningReminders();

      expect(sendMailFake.callCount).to.equal(users.length);

      // Cleanup
      await EventService.updateEvent(event.id, {
        startDate: event.startDate,
      });
    });
    it('should send a reminder to events starting in two days and an second from now', async () => {
      const event = ctx.events[0];
      const now = new Date();
      const users = Array.from(new Set(event.answers.filter((a) => a.availability == null).map((a) => a.user)));
      const startDate = new Date(now.getTime() + 1000 * 3600 * 24 * 2 + 1000);
      await EventService.updateEvent(event.id, {
        startDate,
      });

      await EventService.sendEventPlanningReminders(now);

      expect(sendMailFake.callCount).to.equal(users.length);

      // Cleanup
      await EventService.updateEvent(event.id, {
        startDate: event.startDate,
      });
    });
    it('should send a reminder to events starting in three days from now', async () => {
      const event = ctx.events[0];
      const now = new Date();
      const users = Array.from(new Set(event.answers.filter((a) => a.availability == null).map((a) => a.user)));
      const startDate = new Date(now.getTime() + 1000 * 3600 * 24 * 3);
      await EventService.updateEvent(event.id, {
        startDate,
      });

      await EventService.sendEventPlanningReminders(now);

      expect(sendMailFake.callCount).to.equal(users.length);

      // Cleanup
      await EventService.updateEvent(event.id, {
        startDate: event.startDate,
      });
    });
    it('should not send a reminder to events starting in three days and one minute from now', async () => {
      const event = ctx.events[0];
      const now = new Date();
      const startDate = new Date(now.getTime() + 1000 * 3600 * 24 * 4 + 1000);
      await EventService.updateEvent(event.id, {
        startDate,
      });

      await EventService.sendEventPlanningReminders(now);

      expect(sendMailFake.callCount).to.equal(0);

      // Cleanup
      await EventService.updateEvent(event.id, {
        startDate: event.startDate,
      });
    });
  });

  describe('syncEventShiftAnswers', () => {
    it('should correctly change answers when users change role', async () => {
      const event = ctx.events.find((e) => e.answers.length > 0 && e.answers.every((a) => ctx.eventShifts.map((s) => s.id).includes(a.shiftId)));
      const answer = event.answers[event.answers.length - 1];
      const shiftIds = event.shifts.map((a) => a.id);
      const roleWithUsers = ctx.roles.filter((r) => r.userId === answer.userId);
      const roleWithUser = roleWithUsers[0];
      expect(event).to.not.be.undefined;
      expect(roleWithUsers).to.not.be.undefined;
      expect(roleWithUsers.length).to.equal(1);
      expect(await EventShiftAnswer.findOne({ where: { eventId: event.id, shiftId: answer.shiftId, userId: answer.userId } })).to.not.be.null;

      const eventResponse1 = await EventService.getSingleEvent(event.id);
      const answers1 = await EventService.syncEventShiftAnswers(event);
      expect(eventResponse1.shifts.reduce((t, e) => t + e.answers.length, 0)).to.equal(answers1.length);

      await AssignedRole.delete({ userId: roleWithUser.userId, role: roleWithUser.role });

      const answers2 = await EventService.syncEventShiftAnswers(event);
      const removedAnswers = answers1.filter((a1) => answers2.findIndex((a2) => a2.userId === a1.user.id) === -1);

      expect(removedAnswers.length).to.be.greaterThan(0);
      removedAnswers.forEach((r) => {
        expect(r.user.id).to.equal(roleWithUser.userId);
      });

      expect(await EventShiftAnswer.findOne({ where: { eventId: event.id, userId: roleWithUser.userId } })).to.be.null;

      // Cleanup
      await AssignedRole.insert({
        userId: roleWithUser.userId,
        role: roleWithUser.role,
        createdAt: roleWithUser.createdAt,
        updatedAt: roleWithUser.updatedAt,
        version: roleWithUser.version,
      });
      await EventService.syncEventShiftAnswers(event, shiftIds);
    });
    it('should throw an error when a non-existent shift is provided', async () => {
      await expect(EventService.syncEventShiftAnswers(ctx.events[0], [9999999]))
        .to.eventually.be.rejectedWith('Invalid list of shiftIds provided.');
    });
  });

  describe('syncAllEventShiftAnswers', () => {
    it('should correctly change answers when users change role', async () => {
      const event = ctx.events.find((e) => e.answers.length > 0 && e.answers.every((a) => ctx.eventShifts.map((s) => s.id).includes(a.shiftId)));
      const answer = event.answers[event.answers.length - 1];
      const shiftIds = event.shifts.map((a) => a.id);
      const roleWithUsers = ctx.roles.filter((r) => r.userId === answer.userId);
      const roleWithUser = roleWithUsers[0];
      expect(event).to.not.be.undefined;
      expect(roleWithUsers).to.not.be.undefined;
      expect(roleWithUsers.length).to.equal(1);
      expect(await EventShiftAnswer.findOne({ where: { eventId: event.id, shiftId: answer.shiftId, userId: answer.userId } })).to.not.be.null;

      await EventService.syncAllEventShiftAnswers();
      expect(await EventShiftAnswer.findOne({ where: { eventId: event.id, shiftId: answer.shiftId, userId: answer.userId } })).to.not.be.null;

      await AssignedRole.delete({ userId: roleWithUser.userId, role: roleWithUser.role });

      await EventService.syncAllEventShiftAnswers();
      expect(await EventShiftAnswer.findOne({ where: { eventId: event.id, userId: roleWithUser.userId } })).to.be.null;

      // Cleanup
      await AssignedRole.insert({
        userId: roleWithUser.userId,
        role: roleWithUser.role,
        createdAt: roleWithUser.createdAt,
        updatedAt: roleWithUser.updatedAt,
        version: roleWithUser.version,
      });
      await EventService.syncEventShiftAnswers(event, shiftIds);
    });
  });

  describe('createEvent', () => {
    it('should correctly create event', async () => {
      const shift = ctx.eventShifts[0];
      const params: CreateEventParams = {
        createdById: ctx.users[0].id,
        name: 'TestEvent',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 1000 * 60 * 60),
        shiftIds: [shift.id],
        type: EventType.BORREL,
      };
      const event = await EventService.createEvent(params);

      expect(event).to.not.be.undefined;
      expect(event.name).to.equal(params.name);
      expect(event.createdBy.id).to.equal(params.createdById);
      expect(event.startDate).to.equal(params.startDate.toISOString());
      expect(event.endDate).to.equal(params.endDate.toISOString());
      expect(event.shifts.length).to.equal(params.shiftIds.length);

      const users = ctx.roles
        .filter((r) => shift.roles.includes(r.role))
        .map((r) => r.user);
      const userIds = users.map((u) => u.id);
      const actualUserIds = Array.from(new Set(
        event.shifts.map((s) => s.answers.map((a) => a.user.id)).flat(),
      ));
      expect(actualUserIds.length).to.be.greaterThan(0);
      expect(actualUserIds).to.deep.equalInAnyOrder(userIds);

      // Cleanup
      await Event.delete(event.id);
    });
    it('should create event with no shifts', async () => {
      const params: CreateEventParams = {
        createdById: ctx.users[0].id,
        name: 'TestEvent',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 1000 * 60 * 60),
        shiftIds: [],
        type: EventType.BORREL,
      };
      const event = await EventService.createEvent(params);

      expect(event).to.not.be.undefined;
      expect(event.shifts).to.be.empty;

      // Cleanup
      await Event.delete(event.id);
    });
    it('should throw an error when a non-existent shift is provided', async () => {
      const params: CreateEventParams = {
        createdById: ctx.users[0].id,
        name: 'TestEvent',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 1000 * 60 * 60),
        shiftIds: [9999999],
        type: EventType.BORREL,
      };
      await expect(EventService.createEvent(params)).to.eventually.be.rejectedWith('Invalid list of shiftIds provided.');
    });
  });

  describe('updateEvent', () => {
    let originalEvent: Event;
    let newShift: EventShift;

    before(async () => {
      originalEvent = await Event.findOne({
        where: { answers: { shift: { deletedAt: null } } },
        relations: ['answers', 'answers.shift'],
      });
    });

    after(async () => {
      await EventService.updateEvent(originalEvent.id, {
        name: originalEvent.name,
        startDate: originalEvent.startDate,
        endDate: originalEvent.endDate,
        shiftIds: originalEvent.answers
          .map((a) => a.shiftId)
          .filter((a1, i, all) => i === all
            .findIndex((a2) => a2 === a1)),
      });
    });

    it('should correctly update name', async () => {
      const name = 'AViCo Centurion Marathon';
      const event = await EventService.updateEvent(originalEvent.id, {
        name,
      });
      expect(event.name).to.equal(name);
      expect((await Event.findOne({ where: { id: originalEvent.id } })).name).to.equal(name);
    });
    it('should correctly update startDate', async () => {
      const startDate = new Date('2020-07-01');
      const event = await EventService.updateEvent(originalEvent.id, {
        startDate: startDate,
      });
      expect(event.startDate).to.equal(startDate.toISOString());
      expect((await Event.findOne({ where: { id: originalEvent.id } })).startDate.getTime()).to.equal(startDate.getTime());
    });
    it('should correctly update endDate', async () => {
      const endDate = new Date('2020-07-01');
      const event = await EventService.updateEvent(originalEvent.id, {
        endDate: endDate,
      });
      expect(event.endDate).to.equal(endDate.toISOString());
      expect((await Event.findOne({ where: { id: originalEvent.id } })).endDate.getTime()).to.equal(endDate.getTime());
    });
    it('should correctly update shiftIds by adding a shift', async () => {
      const shifts = originalEvent.answers
        .map((a) => a.shift)
        .filter((a1, i, all) => i === all
          .findIndex((a2) => a2.id === a1.id));
      expect(shifts.length).to.be.greaterThan(1);

      newShift = ctx.eventShifts
        .find((s1) => !shifts.map((s2) => s2.id).includes(s1.id) && s1.roles.length > 0);
      expect(newShift).to.not.be.undefined;

      const shiftIds = [...shifts.map((s) => s.id), newShift.id];
      const event = await EventService.updateEvent(originalEvent.id, {
        shiftIds,
      });

      // Answer sheets should include new shift
      expect(event.shifts.map((s) => s.id)).to.deep.equalInAnyOrder(shiftIds);
      event.shifts.forEach((s) => {
        expect(s.answers.length).to.be.greaterThan(0);
      });

    });
    it('should correctly update shiftIds by removing a shift', async function () {
      // Skip this test case if newShift is undefined, i.e. we did not run the previous test case
      if (newShift == null) {
        this.skip();
        return;
      }

      const shifts = originalEvent.answers
        .map((a) => a.shift)
        .filter((a1, i, all) => i === all
          .findIndex((a2) => a2.id === a1.id));
      expect(shifts.length).to.be.greaterThan(1);

      const shiftIds = [...shifts.map((s) => s.id)];
      const event = await EventService.updateEvent(originalEvent.id, {
        shiftIds,
      });

      // Answer sheets should no longer include new shift
      const actualIds = event.shifts.map((s) => s.id);
      expect(actualIds).to.deep.equalInAnyOrder(shiftIds);
      expect(actualIds.findIndex((i) => i === newShift.id)).to.equal(-1);
    });
    it('should throw an error when a non-existent shift is provided', async () => {
      await expect(EventService.updateEvent(originalEvent.id, {
        shiftIds: [9999999],
      })).to.eventually.be.rejectedWith('Invalid list of shiftIds provided.');
    });
    it('should return undefined if event does not exist', async () => {
      const event = await EventService.updateEvent(9999999999, { name: 'does not matter' });
      expect(event).to.be.undefined;
    });
  });

  describe('getShifts', () => {
    it('should return all shifts', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records: shifts, _pagination } = await EventService.getEventShifts({});
      expect(shifts.length).to.equal(ctx.eventShifts.filter((s) => s.deletedAt == null).length);

      shifts.forEach((s) => {
        const actualShift = ctx.eventShifts.find((s2) => s2.id === s.id);
        expect(actualShift).to.not.be.undefined;
        checkEventShift(s, actualShift);
      });

      expect(_pagination.count).to.equal(shifts.length);
      expect(_pagination.take).to.be.undefined;
    });
  });

  describe('createShift', () => {
    it('should correctly create a new shift', async () => {
      const name = 'Feuten op dweilen zetten';
      const roles = ['BAC Veurzitter', 'BAC Oud-veurzitter'];
      const shift = await EventService.createEventShift({
        name,
        roles,
      });
      expect(shift).to.not.be.undefined;
      expect(shift.name).to.equal(name);
      expect(shift.roles).to.deep.equalInAnyOrder(roles);

      const dbShift = await EventShift.findOne({ where: { id: shift.id } });
      expect(dbShift).to.not.be.undefined;
      expect(dbShift.name).to.equal(name);

      // Cleanup
      await dbShift.remove();
    });
  });

  describe('updateShift', () => {
    let originalShift: EventShift;

    before(async () => {
      originalShift = await EventShift.findOne({
        where: { id: ctx.eventShifts[0].id },
      });
    });

    after(async () => {
      await EventShift.update(originalShift.id, {
        name: originalShift.name,
        roles: originalShift.roles,
      });
    });

    it('should correctly update nothing', async () => {
      const shift = await EventService.updateEventShift(originalShift.id, {});
      expect(shift.name).to.equal(originalShift.name);
      expect(shift.roles).to.deep.equalInAnyOrder(originalShift.roles);
    });

    it('should correctly update name', async () => {
      const name = 'UpdatedName';
      const shift = await EventService.updateEventShift(originalShift.id, {
        name,
      });

      expect(shift.name).to.equal(name);
      expect((await EventShift.findOne({ where: { id: originalShift.id } })).name)
        .to.equal(name);
    });

    it('should correctly update roles', async () => {
      const roles = ['A', 'B', 'C'];
      const shift = await EventService.updateEventShift(originalShift.id, {
        roles,
      });

      expect(shift.roles).to.equal(roles);
      expect((await EventShift.findOne({ where: { id: originalShift.id } })).roles)
        .to.deep.equalInAnyOrder(roles);
    });
    it('should return undefined if shift does not exist', async () => {
      const shift = await EventService.updateEventShift(99999, {});
      expect(shift).to.be.undefined;
    });
  });

  describe('updateEventShiftAnswer', () => {
    let originalAnswer: EventShiftAnswer;

    before(async () => {
      const answer = ctx.eventShiftAnswers.find((a) => a.availability === null && a.selected === false);
      expect(answer).to.not.be.undefined;

      const { userId, shiftId, eventId } = answer;
      originalAnswer = await EventShiftAnswer.findOne({ where: {
        userId, shiftId, eventId,
      } });
    });

    after(async () => {
      await EventShiftAnswer.update({
        userId: ctx.eventShiftAnswers[0].userId,
        shiftId: ctx.eventShiftAnswers[0].shiftId,
        eventId: ctx.eventShiftAnswers[0].eventId,
      }, {
        availability: originalAnswer.availability,
        selected: originalAnswer.selected,
      });
    });

    it('should correctly update nothing', async () => {
      const answer = await EventService.updateEventShiftAnswer(originalAnswer.eventId, originalAnswer.shiftId, originalAnswer.userId, {});
      expect(answer.user.id).to.equal(originalAnswer.userId);
      expect(answer.availability).to.equal(originalAnswer.availability);
      expect(answer.selected).to.equal(originalAnswer.selected);
    });
    it('should correctly update availability', async () => {
      const { eventId, shiftId, userId } = originalAnswer;

      let availability = Availability.YES;
      let answer = await EventService.updateEventShiftAnswer(originalAnswer.eventId, originalAnswer.shiftId, originalAnswer.userId, { availability });
      expect(answer.availability).to.equal(availability);
      expect((await EventShiftAnswer.findOne({ where: {
        eventId, shiftId, userId,
      } })).availability).to.equal(availability);

      availability = Availability.LATER;
      answer = await EventService.updateEventShiftAnswer(originalAnswer.eventId, originalAnswer.shiftId, originalAnswer.userId, { availability });
      expect(answer.availability).to.equal(availability);
      expect((await EventShiftAnswer.findOne({ where: {
        eventId, shiftId, userId,
      } })).availability).to.equal(availability);

      // Cleanup
      availability = originalAnswer.availability;
      answer = await EventService.updateEventShiftAnswer(originalAnswer.eventId, originalAnswer.shiftId, originalAnswer.userId, { availability });
      expect(answer.availability).to.equal(null);
    });
    it('should correctly update selection', async () => {
      const { eventId, shiftId, userId } = originalAnswer;

      let selected = true;
      let answer = await EventService.updateEventShiftAnswer(originalAnswer.eventId, originalAnswer.shiftId, originalAnswer.userId, { selected });
      expect(answer.selected).to.equal(selected);
      expect((await EventShiftAnswer.findOne({ where: {
        eventId, shiftId, userId,
      } })).selected).to.equal(selected);

      // Cleanup
      await EventService.updateEventShiftAnswer(originalAnswer.eventId, originalAnswer.shiftId, originalAnswer.userId, { selected: !selected });
    });
    it('should return undefined if answer does not exist', async () => {
      const answer = await EventService.updateEventShiftAnswer(99999, 99999, 99999, {});
      expect(answer).to.be.undefined;
    });
  });

  describe('getShiftSelectedCount', () => {
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
        const counts = await EventService.getShiftSelectedCount(shiftId);
        expect(counts.length).to.equal(userIds.length);
        counts.forEach((c) => {
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
        const counts = await EventService.getShiftSelectedCount(shiftId, { eventType });
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
        const counts = await EventService.getShiftSelectedCount(shiftId, { afterDate });
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
        const counts = await EventService.getShiftSelectedCount(shiftId, { beforeDate });
        counts.forEach((c) => {
          expect(c.count).to.equal(1);
        });
      }));
    });
  });

  describe('deleteShift', () => {
    it('should soft delete shift if it has answers', async () => {
      const shift = ctx.eventShiftAnswers[0].shift;
      const dbShift = await EventShift.findOne({ where: { id: shift.id }, withDeleted: true });
      expect(dbShift).to.not.be.null;
      expect(dbShift.deletedAt).to.be.null;
      expect((await EventShiftAnswer.find({ where: { shiftId: shift.id } })).length).to.be.greaterThan(0);

      await EventService.deleteEventShift(shift.id);

      const dbShift2 = await EventShift.findOne({ where: { id: shift.id }, withDeleted: true });
      expect(dbShift2).to.not.be.null;
      expect(dbShift2.deletedAt).to.not.be.null;
      expect(new Date().getTime() - dbShift2.deletedAt.getTime()).to.be.at.most(1000);

      // Cleanup
      dbShift2.deletedAt = null;
      await dbShift2.save();
    });
    it('should delete shift if it has no answers', async () => {
      const shift = ctx.eventShifts[3];
      const dbShift = await EventShift.findOne({ where: { id: shift.id }, withDeleted: true });
      expect(dbShift).to.not.be.null;
      expect(dbShift.deletedAt).to.be.null;
      expect((await EventShiftAnswer.find({ where: { shiftId: shift.id } })).length).to.equal(0);

      await EventService.deleteEventShift(shift.id);

      const dbShift2 = await EventShift.findOne({ where: { id: shift.id }, withDeleted: true });
      expect(dbShift2).to.be.null;

      // Cleanup
      await EventShift.insert({
        id: shift.id,
        name: shift.name,
        roles: [],
      });
    });
    it('should delete shift if it was soft-deleted before', async () => {
      const shift = ctx.eventShifts[3];
      let dbShift = await EventShift.findOne({ where: { id: shift.id }, withDeleted: true });
      expect(dbShift).to.not.be.null;
      expect(dbShift.deletedAt).to.be.null;
      expect((await EventShiftAnswer.find({ where: { shiftId: shift.id } })).length).to.equal(0);

      await dbShift.softRemove();
      dbShift = await EventShift.findOne({ where: { id: dbShift.id }, withDeleted: true });
      expect(dbShift).to.not.be.null;
      expect(dbShift.deletedAt).to.not.be.null;

      await EventService.deleteEventShift(dbShift.id);

      dbShift = await EventShift.findOne({ where: { id: dbShift.id }, withDeleted: true });
      expect(dbShift).to.be.null;

      // Cleanup
      await EventShift.insert({
        id: shift.id,
        name: shift.name,
        roles: [],
      });
    });
    it('should simply return when shift does not exist', async () => {
      expect(EventService.deleteEventShift(9999999)).to.eventually.not.throw;
    });
  });

  describe('deleteEvent', () => {
    it('should correctly delete an event with its answer sheets', async () => {
      const event = ctx.events[0];
      const dbEvent = await Event.findOne({ where: { id: event.id } });
      expect(dbEvent).to.not.be.null;

      await EventService.deleteEvent(event.id);

      const dbEvent2 = await Event.findOne({ where: { id: event.id } });
      expect(dbEvent2).to.be.null;

      const answers = await EventShiftAnswer.find({ where: { eventId: event.id } });
      expect(answers.length).to.equal(0);
    });
    it('should simply return when event does not exist', async () => {
      expect(await EventService.deleteEvent(9999999)).to.not.throw;
    });
  });
});
