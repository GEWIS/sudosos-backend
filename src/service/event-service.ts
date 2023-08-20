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
import { FindManyOptions, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  BaseEventResponse,
  BaseEventShiftResponse,
  EventAnswerResponse,
  EventResponse,
  EventShiftResponse,
} from '../controller/response/event-response';
import {
  CreateEventAnswerRequest,
  CreateEventParams,
  CreateEventShiftRequest,
  SelectEventAnswer,
  UpdateEvent,
  UpdateEventAnswerAvailability,
  UpdateEventShift,
} from '../controller/request/event-request';
import Event from '../entity/event/event';
import EventShift from '../entity/event/event-shift';
import EventShiftAnswer from '../entity/event/event-shift-answer';
import User from '../entity/user/user';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate, asNumber } from '../helpers/validators';

export interface EventFilterParameters {
  name?: string;
  id?: number;
  createdById?: number;
  beforeDate?: Date;
  afterDate?: Date;
}
export interface EventShiftFilterParameters {
  name?: string;
  default?: boolean;
}

export interface EventAnswerFilterParameters {
  userId?: number;
  availability?: number;
  selected?: boolean;
  shiftId?: number;
  eventId?: number;
}

export function parseEventFilterParameters(
  req: RequestWithToken,
): EventFilterParameters {
  return {
    name: req.query.name.toString(),
    id: asNumber(req.query.eventId),
    createdById: asNumber(req.query.createById),
    beforeDate: asDate(req.query.beforeDate),
    afterDate: asDate(req.query.afterDate),
  };
}

/**
 * Wrapper for all Borrel-schema related logic.
 */
export default class EventService {
  private static asBaseEventResponse(entity: Event): BaseEventResponse {
    return {
      createdAt: entity.createdAt.toISOString(),
      createdBy: parseUserToBaseResponse(entity.createdBy, false),
      endDate: entity.endDate.toISOString(),
      id: entity.id,
      name: entity.name,
      startDate: entity.startDate.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  private static asEventResponse(entity: Event): EventResponse {
    return {
      ...this.asBaseEventResponse(entity),
      answers: entity.answers.map((a) => this.asEventAnswerResponse(a)),
    };
  }

  private static asEventShiftResponse(entity: EventShift):
  EventShiftResponse {
    return {
      default: entity.default,
      createdAt: entity.createdAt.toISOString(),
      id: entity.id,
      name: entity.name,
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  private static asEventAnswerResponse(entity: EventShiftAnswer):
  EventAnswerResponse {
    return {
      availability: entity.availability,
      selected: entity.selected,
      shift: this.asEventShiftResponse(entity.shift),
      user: parseUserToBaseResponse(entity.user, false),
    };
  }

  /**
   * Get all borrel schemas.
   */
  public static async getEvents(params: EventFilterParameters = {})
    :Promise<BaseEventResponse[]> {
    const filterMapping: FilterMapping = {
      name: 'name',
      id: 'id',
      createdById: 'createdBy.id',
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

    const events = await Event.find({ ...options });
    return events.map((e) => this.asBaseEventResponse(e));
  }

  /**
   * Get a single event with its corresponding shifts and answers
   * @param id
   */
  public static async getSingleEvent(id: number): Promise<EventResponse | undefined> {
    const event = await Event.findOne({
      where: { id },
      relations: ['createdBy', 'answers', 'answers.shift', 'answers.user'],
      withDeleted: true,
    });

    return event ? this.asEventResponse(event) : undefined;
  }

  /**
   * Create and/or remove answer sheets given an event and a list of shifts that
   * should belong to this event. If a shift is changed or a user loses a role
   * that belongs to a shift, their answer sheet is removed from the database.
   * @param event
   * @param shiftIds
   */
  public static async syncEventShiftAnswers(event: Event, shiftIds: number[]) {
    const shifts = await EventShift.find({ where: { id: In(shiftIds) } });

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
  public static async createEvent(eventRequest: CreateEventParams)
    : Promise<EventResponse> {
    const createdBy = await User.findOne({ where: { id: eventRequest.createdById } });

    const event: Event = Object.assign(new Event(), {
      name: eventRequest.name,
      createdBy,
      startDate: new Date(eventRequest.startDate),
      endDate: new Date(eventRequest.endDate),
    });
    await Event.save(event);

    event.answers = await this.syncEventShiftAnswers(event, eventRequest.shiftIds);
    return this.asEventResponse(event);
  }

  /**
   * Update an existing event.
   */
  public static async updateEvent(id: number, update: Partial<UpdateEvent>) {
    const event = await Event.findOne({
      where: { id },
      relations: ['answers'],
    });
    if (!event) return undefined;

    const { shiftIds, ...rest } = update;
    await Event.update(id, rest);
    if (update.shiftIds != null) event.answers = await this.syncEventShiftAnswers(event, update.shiftIds);

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
  public static async getEventShifts(): Promise<BaseEventShiftResponse[]> {
    const shifts = await EventShift.find();
    return shifts.map((s) => this.asEventShiftResponse(s));
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
  : CreateEventShiftRequest): Promise<EventShiftResponse> {
  // Create a new Borrel-schema-shift
    const newEventShift: EventShift = Object.assign(new EventShift(), {
      name: eventShiftRequest.name,
      default: eventShiftRequest.default,
    });
    await EventShift.save(newEventShift);
    return this.asEventShiftResponse(newEventShift);
  }

  /**
   * Update borrel schema shift.
   */
  public static async updateEventShift(id: number, update: UpdateEventShift) {
    const shift = await EventShift.findOne({ where: { id } });
    if (!shift) return undefined;
    shift.name = update.name;
    shift.default = update.default;
    await EventShift.save(shift);
    return this.asEventShiftResponse(shift);
  }

  /**
   * Create borrel schema answer.
   */
  public static async createEventAnswer(eventAnswerRequest
  : CreateEventAnswerRequest): Promise<EventAnswerResponse> {
    // Create a new Borrel-schema-answer
    const user = await User.findOne({ where: { id: eventAnswerRequest.userId } });
    const shift = await EventShift.findOne({
      where:
          { id: eventAnswerRequest.shiftId },
    });
    const event = await Event.findOne({
      where:
          { id: eventAnswerRequest.eventId },
    });
    const newEventAnswer: EventShiftAnswer = Object.assign(new EventShiftAnswer(), {
      user,
      availability: eventAnswerRequest.availability,
      selected: eventAnswerRequest.selected,
      shift,
      event,
    });
    await EventShiftAnswer.save(newEventAnswer);
    return this.asEventAnswerResponse(newEventAnswer);
  }

  // /**
  //  * Update borrel schema answer availability.
  //  */
  // public static async updateEventAnswerAvailability(
  //   id: number, update: UpdateEventAnswerAvailability,
  // ) {
  //   const answer = await EventShiftAnswer.findOne({ where: { id } });
  //   if (!answer) return undefined;
  //   answer.availability = update.availability;
  //   await EventShiftAnswer.save(answer);
  //   return this.asEventAnswerResponse(answer);
  // }
  //
  // /**
  //  * Update borrel schema answer selection.
  //  */
  // public static async selectEventAnswer(
  //   id: number, update: SelectEventAnswer,
  // ) {
  //   const answer = await EventShiftAnswer.findOne({ where: { id } });
  //   if (!answer) return undefined;
  //   answer.selected = update.selected;
  //   await EventShiftAnswer.save(answer);
  //   return this.asEventAnswerResponse(answer);
  // }
  //
  // /**
  //  * Delete borrel schema answer.
  //  */
  // public static async deleteEventParticipantAnswers(
  //   eventId: number, participantId: number,
  // ) {
  //   const answers = await EventShiftAnswer.find({ where: { event: { id: eventId }, user: { id: participantId } } });
  //   const answerIds = answers.map((answer) => answer.id);
  //   await EventShiftAnswer.delete(answerIds);
  // }
}
