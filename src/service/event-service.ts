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
import { Between, FindManyOptions, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  BaseEventAnswerResponse,
  BaseEventResponse,
  BaseEventShiftResponse,
  EventInShiftResponse,
  EventResponse,
  EventShiftResponse,
  PaginatedBaseEventResponse,
  PaginatedEventShiftResponse,
} from '../controller/response/event-response';
import {
  EventAnswerAssignmentRequest,
  EventAnswerAvailabilityRequest,
  EventShiftRequest,
} from '../controller/request/event-request';
import Event, { EventType } from '../entity/event/event';
import EventShift from '../entity/event/event-shift';
import EventShiftAnswer from '../entity/event/event-shift-answer';
import User from '../entity/user/user';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { RequestWithToken } from '../middleware/token-middleware';
import { asArrayOfNumbers, asDate, asEventType, asNumber } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import AssignedRole from '../entity/roles/assigned-role';
import Mailer from '../mailer';
import ForgotEventPlanning from '../mailer/templates/forgot-event-planning';
import { Language } from '../mailer/templates/mail-template';

export interface EventFilterParameters {
  name?: string;
  id?: number;
  createdById?: number;
  beforeDate?: Date;
  afterDate?: Date;
  type?: EventType;
}

export interface UpdateEventParams {
  name: string,
  startDate: Date,
  endDate: Date,
  shiftIds: number[],
  type: EventType,
}

export interface CreateEventParams extends UpdateEventParams {
  createdById: number,
}

export interface UpdateEventAnswerParams extends EventAnswerAssignmentRequest, EventAnswerAvailabilityRequest {}

export function parseEventFilterParameters(
  req: RequestWithToken,
): EventFilterParameters {
  return {
    name: req.query.name?.toString(),
    id: asNumber(req.query.eventId),
    createdById: asNumber(req.query.createdById),
    beforeDate: asDate(req.query.beforeDate),
    afterDate: asDate(req.query.afterDate),
    type: asEventType(req.query.type),
  };
}

/**
 * Parse the body of a request to an UpdateEventParams object
 * @param req
 * @param partial - Whether all attributes are required or not
 * @param id
 * @throws Error - validation failed
 */
export async function parseUpdateEventRequestParameters(
  req: RequestWithToken, partial = false, id?: number,
): Promise<UpdateEventParams> {
  const params: UpdateEventParams = {
    name: req.body.name !== undefined ? req.body.name.toString() : undefined,
    startDate: asDate(req.body.startDate),
    endDate: asDate(req.body.endDate),
    shiftIds: asArrayOfNumbers(req.body.shiftIds),
    type: asEventType(req.body.type),
  };
  if (!partial && (!params.name || !params.startDate || !params.endDate)) throw new Error('Not all attributes are defined.');
  if (req.body.shiftIds !== undefined && (params.shiftIds === undefined || params.shiftIds.length === 0)) throw new Error('No shifts provided.');

  if (params.name === '') throw new Error('Invalid name.');
  if (params.startDate && params.startDate.getTime() < new Date().getTime()) throw new Error('EndDate is in the past.');
  if (params.endDate && params.endDate.getTime() < new Date().getTime()) throw new Error('StartDate is in the past.');
  if (params.startDate && params.endDate && params.endDate.getTime() < params.startDate.getTime()) throw new Error('EndDate is before startDate.');
  if (!params.startDate && params.endDate !== undefined && id !== undefined) {
    const event = await Event.findOne({ where: { id } });
    if (event.startDate.getTime() > params.endDate.getTime()) throw new Error('EndDate is before existing startDate.');
  }

  if (params.shiftIds !== undefined) {
    const shifts = await EventShift.find({ where: { id: In(params.shiftIds) } });
    if (shifts.length !== params.shiftIds.length) throw new Error('Not all given shifts exist.');

    // Check that every shift has at least 1 person to do the shift
    // First, get an array with tuples. The first item is the ID, the second whether the shift has any users.
    const shiftsWithUsers = await Promise.all(shifts.map(async (s) => {
      const roles = await AssignedRole.find({ where: { role: In(s.roles) }, relations: ['user'] });
      return [s.id, roles.length > 0];
    }));
    // Then, apply a filter to only get the shifts without users
    const shiftsWithoutUsers = shiftsWithUsers.filter((s) => s[1] === false);
    // If there is more than one, return an error.
    if (shiftsWithoutUsers.length > 0) {
      throw new Error(`Shift with ID ${shiftsWithUsers.map((s) => s[0]).join(', ')} has no users. Make sure the shift's roles are correct.`);
    }
  }
  return params;
}

/**
 * Wrapper for all Borrel-schema related logic.
 */
export default class EventService {
  private static asBaseEventResponse(entity: Event): BaseEventResponse {
    return {
      id: entity.id,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
      createdBy: parseUserToBaseResponse(entity.createdBy, false),
      name: entity.name,
      endDate: entity.endDate.toISOString(),
      startDate: entity.startDate.toISOString(),
      type: entity.type,
    };
  }

  private static asEventResponse(entity: Event): EventResponse {
    return {
      ...this.asBaseEventResponse(entity),
      shifts: entity.shifts.map((s) => this.asShiftInEventResponse(entity, s, entity.answers)),
    };
  }

  private static asBaseEventShiftResponse(entity: EventShift):
  BaseEventShiftResponse {
    return {
      createdAt: entity.createdAt.toISOString(),
      id: entity.id,
      name: entity.name,
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  private static asEventShiftResponse(entity: EventShift):
  EventShiftResponse {
    return {
      ...this.asBaseEventShiftResponse(entity),
      roles: entity.roles,
    };
  }

  private static asShiftInEventResponse(
    event: Event, shift: EventShift, answers: EventShiftAnswer[],
  ): EventInShiftResponse {
    return {
      ...this.asEventShiftResponse(shift),
      answers: answers
        .filter((a) => a.eventId === event.id && a.shiftId === shift.id)
        .map((a) => this.asBaseEventAnswerResponse(a)),
    };
  }

  private static asBaseEventAnswerResponse(entity: EventShiftAnswer): BaseEventAnswerResponse {
    return {
      availability: entity.availability,
      selected: entity.selected,
      user: parseUserToBaseResponse(entity.user, false),
    };
  }

  /**
   * Get all borrel schemas.
   */
  public static async getEvents(params: EventFilterParameters = {}, { take, skip }: PaginationParameters = {})
    :Promise<PaginatedBaseEventResponse> {
    const filterMapping: FilterMapping = {
      name: '%name',
      id: 'id',
      createdById: 'createdBy.id',
      type: 'type',
    };

    const options: FindManyOptions<Event> = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['createdBy'],
      order: { startDate: 'desc' },
    };

    if (params.beforeDate) {
      options.where = {
        ...options.where,
        startDate: LessThanOrEqual(params.beforeDate),
      };
    }
    if (params.afterDate) {
      options.where = {
        ...options.where,
        startDate: MoreThanOrEqual(params.afterDate),
      };
    }
    if (params.beforeDate && params.afterDate) {
      options.where = {
        ...options.where,
        startDate: Between(params.afterDate, params.beforeDate),
      };
    }

    const events = await Event.find({ ...options, take, skip });
    const count = await Event.count(options);
    return {
      _pagination: { take, skip, count },
      records: events.map((e) => this.asBaseEventResponse(e)),
    };
  }

  /**
   * Get a single event with its corresponding shifts and answers
   * @param id
   */
  public static async getSingleEvent(id: number): Promise<EventResponse | undefined> {
    const event = await Event.findOne({
      where: { id },
      relations: ['createdBy', 'shifts', 'answers', 'answers.user'],
      withDeleted: true,
    });

    return event ? this.asEventResponse(event) : undefined;
  }

  /**
   * Synchronize all answer sheets with the corresponding users and shifts
   */
  public static async syncAllEventShiftAnswers() {
    const events = await Event.find({ where: { startDate: MoreThanOrEqual(new Date()) }, relations: ['answers', 'shifts'] });
    await Promise.all(events.map((e) => this.syncEventShiftAnswers(e)));
  }

  /**
   * Create and/or remove answer sheets given an event and a list of shifts that
   * should belong to this event. If a shift is changed or a user loses a role
   * that belongs to a shift, their answer sheet is removed from the database.
   * @param event
   * @param shiftIds
   */
  public static async syncEventShiftAnswers(event: Event, shiftIds?: number[]) {
    if (!shiftIds) {
      shiftIds = event.shifts.map((s) => s.id);
    }

    const shifts = await EventShift.find({ where: { id: In(shiftIds) } });
    if (shifts.length != shiftIds.length) throw new Error('Invalid list of shiftIds provided.');

    // Get the answer sheet for every user that can do a shift
    // Create it if it does not exist
    const answers = (await Promise.all(shifts.map(async (shift) => {
      const users = await User.find({ where: { roles: { role: In(shift.roles) } } });
      return Promise.all(users.map(async (user) => {
        // Find the answer sheet in the database
        const dbAnswer = await EventShiftAnswer.findOne({
          where: { user: { id: user.id }, event: { id: event.id }, shift: { id: shift.id } },
          relations: ['shift', 'user'],
        });
        // Return it if it exists. Otherwise create a new one
        if (dbAnswer != null) return dbAnswer;
        const newAnswer = Object.assign(new EventShiftAnswer(), {
          user,
          shift,
          event,
        });
        return (await newAnswer.save()) as any as Promise<EventShiftAnswer>;
      }));
    }))).flat();

    const answersToRemove = (event.answers ?? [])
      .filter((a1) => answers
        .findIndex((a2) => a1.userId === a2.userId && a1.eventId === a2.eventId && a1.shiftId == a2.shiftId) === -1);

    await EventShiftAnswer.remove(answersToRemove);

    return answers;
  }

  /**
     * Create a new event.
     */
  public static async createEvent(params: CreateEventParams)
    : Promise<EventResponse> {
    const createdBy = await User.findOne({ where: { id: params.createdById } });
    const shifts = await EventShift.find({ where: { id: In(params.shiftIds) } });

    if (shifts.length !== params.shiftIds.length) throw new Error('Invalid list of shiftIds provided.');

    const event: Event = Object.assign(new Event(), {
      name: params.name,
      createdBy,
      startDate: params.startDate,
      endDate: params.endDate,
      type: params.type,
      shifts,
    });
    await Event.save(event);

    event.answers = await this.syncEventShiftAnswers(event, params.shiftIds);
    return this.asEventResponse(event);
  }

  /**
   * Update an existing event.
   */
  public static async updateEvent(id: number, params: Partial<UpdateEventParams>) {
    const event = await Event.findOne({
      where: { id },
    });
    if (!event) return undefined;

    const { shiftIds, ...rest } = params;
    await Event.update(id, rest);
    await event.reload();

    if (params.shiftIds != null) {
      const shifts = await EventShift.find({ where: { id: In(params.shiftIds) } });
      if (shifts.length !== params.shiftIds.length) throw new Error('Invalid list of shiftIds provided.');
      event.shifts = shifts;
      await Event.save(event);

      await this.syncEventShiftAnswers(event, params.shiftIds);
    }

    return this.getSingleEvent(id);
  }

  /**
   * Delete borrel schema.
   */
  public static async deleteEvent(id: number): Promise<void> {
    // check if event exists in database
    const event = await Event.findOne({ where: { id } });

    // return undefined if not found
    if (!event) {
      return;
    }
    await Event.remove(event);
  }

  /**
   * Get all event shifts
   */
  public static async getEventShifts({ take, skip }: PaginationParameters): Promise<PaginatedEventShiftResponse> {
    const shifts = await EventShift.find({ take, skip });
    const count = await EventShift.count();
    return {
      _pagination: { take, skip, count },
      records: shifts.map((s) => this.asEventShiftResponse(s)),
    };
  }

  /**
   * Delete an event shift. Soft remove it if it has at least one corresponding answer
   */
  public static async deleteEventShift(id: number): Promise<void> {
    const shift = await EventShift.findOne({
      where: { id },
      withDeleted: true,
    });
    if (shift == null) return;

    const answers = await EventShiftAnswer.find({ where: { shiftId: shift.id } });

    if (answers.length === 0) {
      await shift.remove();
    } else {
      await shift.softRemove();
    }
  }

  /**
   * Create borrel schema shift.
   */
  public static async createEventShift(eventShiftRequest
  : EventShiftRequest): Promise<EventShiftResponse> {
    const newEventShift: EventShift = Object.assign(new EventShift(), {
      name: eventShiftRequest.name,
      roles: eventShiftRequest.roles,
    });
    await EventShift.save(newEventShift);
    return this.asEventShiftResponse(newEventShift);
  }

  /**
   * Update borrel schema shift.
   */
  public static async updateEventShift(id: number, update: Partial<EventShiftRequest>) {
    const shift = await EventShift.findOne({ where: { id } });
    if (!shift) return undefined;
    if (update.name) shift.name = update.name;
    if (update.roles) shift.roles = update.roles;
    await EventShift.save(shift);
    return this.asEventShiftResponse(shift);
  }

  /**
   * Update borrel schema answer
   */
  public static async updateEventShiftAnswer(
    eventId: number, shiftId: number, userId: number, update: Partial<UpdateEventAnswerParams>,
  ) {
    const answer = await EventShiftAnswer.findOne({ where: {
      userId, shiftId, eventId,
    } });
    if (!answer) return undefined;

    if (update.availability !== undefined) answer.availability = update.availability;
    if (update.selected !== undefined) answer.selected = update.selected;

    await answer.save();
    return this.asBaseEventAnswerResponse(answer);
  }

  /**
   * Send a reminder
   * @param date
   */
  public static async sendEventPlanningReminders(date = new Date()) {
    const inTwoDays = new Date(date.getTime() + 1000 * 3600 * 24 * 2);
    const inThreeDays = new Date(date.getTime() + 1000 * 3600 * 24 * 3);
    const events = await EventService.getEvents({ beforeDate: inThreeDays, afterDate: inTwoDays });

    await Promise.all(events.records.map(async (event) => {
      const answers = await EventShiftAnswer.find({ where: { eventId: event.id, availability: IsNull() }, relations: ['user'] });
      // Get all users and remove duplicates
      const users = answers
        .map((a) => a.user)
        .filter((user, i, all) => i === all.findIndex((u) => u.id === user.id));

      // Send every user an email
      return Promise.all(users.map(async (user) => Mailer.getInstance().send(user,
        new ForgotEventPlanning({ name: user.firstName, eventName: event.name }), Language.DUTCH),
      ));
    }));
  }
}
