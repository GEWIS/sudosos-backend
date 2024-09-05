/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
import WithManager from '../../src/database/with-manager';
import Role from '../../src/entity/rbac/role';
import EventShift from '../../src/entity/event/event-shift';
import User from '../../src/entity/user/user';
import Event, { EventType } from '../../src/entity/event/event';
import EventShiftAnswer, { Availability } from '../../src/entity/event/event-shift-answer';
import AssignedRole from '../../src/entity/rbac/assigned-role';

export default class EventSeeder extends WithManager {
  /**
   * Seeds a default dataset of borrelSchemaShifts and stores them in the database
   */
  private async seedEventShifts() {
    const roles = await this.manager.save(Role, [{
      name: 'BAC',
    }, {
      name: 'BAC feut',
    }, {
      name: 'BAC PM',
    }, {
      name: 'Bestuur',
    }, {
      name: 'Kasco',
    }]);

    const eventShifts = await this.manager.save(EventShift, [{
      name: 'Borrelen',
      roles: [roles[0], roles[1]],
    }, {
      name: 'Portier',
      roles: [roles[0], roles[1]],
    }, {
      name: 'Bier halen voor Job en Sjoerd',
      roles: [roles[1]],
    }, {
      name: 'Roy slaan',
      roles: [],
    }, {
      name: '900 euro kwijtraken',
      roles: [roles[0], roles[2]],
    }, {
      name: 'Wassen',
      roles: [roles[3]],
      deletedAt: new Date(),
    }]);
    return {
      roles,
      eventShifts,
    };
  }

  /**
   * Seed an answer for the given user in the given event for the given shift
   * @param user
   * @param event
   * @param shift
   * @param type
   * @private
   */
  private async createEventShiftAnswer(user: User, event: Event, shift: EventShift, type: number) {
    const availabilities = [Availability.YES, Availability.MAYBE, Availability.NO, Availability.LATER, Availability.NA, null];

    const answer: EventShiftAnswer = Object.assign(new EventShiftAnswer(), {
      user,
      availability: availabilities[type + 1 % availabilities.length],
      selected: false,
      eventId: event.id,
      shiftId: shift.id,
    });
    return this.manager.save(EventShiftAnswer, answer);
  }

  /**
   * Seed some events for the given users
   * @param users
   */
  public async seed(users: User[]) {
    const events: Event[] = [];
    const { eventShifts, roles } = await this.seedEventShifts();

    const roleAssignments = (await Promise.all(users.map(async (user, i) => {
      if (i % 3 === 0) return undefined;
      return this.manager.save(AssignedRole, {
        user,
        role: roles[i % 5],
      });
    }))).filter((r) => r != null);

    const eventShiftAnswers: EventShiftAnswer[] = [];
    for (let i = 1; i < eventShifts.length; i += 1) {
      // const startDate = getRandomDate(new Date(), new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 365));
      const startDate = new Date(new Date().getTime() + ((i * 1000000) % (3600 * 24 * 365)) * 1000 + 60000);
      startDate.setMilliseconds(0);
      // Add 2,5 hours
      const endDate = new Date(startDate.getTime() + (1000 * 60 * 60 * 2.5));
      endDate.setMilliseconds(0);

      const event = Object.assign(new Event(), {
        name: `${i}-Testborrel-${i}`,
        createdBy: roleAssignments[i].user,
        startDate,
        endDate,
        type: EventType.BORREL,
        shifts: [],
        id: i,
      });
      await this.manager.save(Event, event);

      const eventShifts1: EventShift[] = [];
      const eventShiftAnswers1: EventShiftAnswer[] = [];
      for (let j = 0; j < ((i + 1) * 243) % 4; j += 1) {
        const shift = eventShifts[((i + j) * 13) % (eventShifts.length)];
        const usersWithRole = roleAssignments.filter((r) => shift.roles.some((r2) => r2.id === r.roleId));
        await Promise.all(usersWithRole.map(async (r, k) => {
          const answer = await this.createEventShiftAnswer(r.user, event, shift, k);
          answer.event = event;
          answer.shift = shift;
          eventShifts1.push(shift);
          eventShiftAnswers.push(answer);
          eventShiftAnswers1.push(answer);
        }));
      }

      event.shifts = eventShifts1.filter((s, j, all) => j === all.findIndex((s2) => s.id === s2.id));
      await this.manager.save(event);

      event.answers = eventShiftAnswers1;
      events.push(event);
    }

    return { roles, roleAssignments, events, eventShifts, eventShiftAnswers };
  }
}
