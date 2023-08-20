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
import { seedEventShifts, seedEvents, seedUsers } from '../../seed';
import Event from '../../../src/entity/event/event';
import EventShift from '../../../src/entity/event/event-shift';
import EventShiftAnswer from '../../../src/entity/event/event-shift-answer';
import Database from '../../../src/database/database';
import EventService from '../../../src/service/event-service';
import { expect } from 'chai';
import { BaseEventResponse } from '../../../src/controller/response/event-response';

describe('eventService', () => {
  let ctx: {
    connection: Connection,
    users: User[],
    events: Event[],
    eventShifts: EventShift[],
    eventShiftAnswers: EventShiftAnswer[],
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const shifts = await seedEventShifts();
    const { events, eventShifts, eventShiftAnswers } = await seedEvents(shifts, users);

    ctx = {
      connection,
      users,
      events,
      eventShifts,
      eventShiftAnswers,
    };
  });

  const checkEvent = (actual: BaseEventResponse, expected: Event) => {
    expect(actual.id).to.equal(expected.id);
    expect(actual.createdAt).to.equal(expected.createdAt.toISOString());
    expect(actual.updatedAt).to.equal(expected.updatedAt.toISOString());
    expect(actual.startDate).to.equal(expected.startDate.toISOString());
    expect(actual.endDate).to.equal(expected.endDate.toISOString());
    expect(actual.name).to.equal(expected.name);
    expect(actual.createdBy.id).to.equal(expected.createdBy.id);
  };

  after(async () => {
    await ctx.connection.destroy();
  });

  describe('getEvents', () => {
    it('should return all events ordered by startDate descending', async () => {
      const events = await EventService.getEvents();
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
      const events = await EventService.getEvents({ id });

      expect(events.length).to.equal(1);
      expect(events[0].id).to.equal(id);
    });
    it('should filter on name', async () => {
      const name = ctx.events[0].name;
      const actualEvents = ctx.events.filter((e) => e.name === name);
      const events = await EventService.getEvents({ name });

      expect(actualEvents.length).to.equal(events.length);
      events.forEach((e) => {
        expect(e.name).to.equal(name);
      });
    });
    it('should filter on date (before)', async () => {
      const beforeDate = ctx.events[0].startDate;
      const actualEvents = ctx.events.filter((e) => e.startDate.getTime() <= beforeDate.getTime());
      const events = await EventService.getEvents({ beforeDate });

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
      const events = await EventService.getEvents({ afterDate });

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
      const events = await EventService.getEvents({ createdById });

      expect(events.length).to.equal(actualEvents.length);
      const ids = actualEvents.map((e) => e.id);
      events.forEach((e) => {
        expect(ids).to.include(e.id);
        expect(e.createdBy.id).to.equal(createdById);
      });
    });
  });
});
