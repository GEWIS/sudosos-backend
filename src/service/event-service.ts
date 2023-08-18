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
import { FindManyOptions } from 'typeorm';
import {
  EventResponse,
  EventAnswerResponse,
  EventShiftResponse,
} from '../controller/response/event-response';
import {
  UpdateEvent,
  CreateEventParams,
  CreateEventShiftRequest,
  CreateEventAnswerRequest,
  UpdateEventShift,
  UpdateEventAnswerAvailability,
  SelectEventAnswer,
} from '../controller/request/event-request';
import Event from '../entity/event/event';
import EventShift from '../entity/event/event-shift';
import EventShiftAnswer from '../entity/event/event-shift-answer';
import User from '../entity/user/user';
import { parseUserToResponse } from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { RequestWithToken } from '../middleware/token-middleware';
import {
  asDate, asNumber,
} from '../helpers/validators';

export interface EventFilterParameters {
  name?: string;
  eventId?: number;
  createById?: number;
  startDate?: Date;
  endDate?: Date;
  shiftId?: number;
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
    name: String(req.query.name),
    eventId: asNumber(req.query.eventId),
    createById: asNumber(req.query.createById),
    startDate: asDate(req.query.startDate),
    endDate: asDate(req.query.endDate),
    shiftId: asNumber(req.query.shiftId),
  };
}

/**
 * Wrapper for all Borrel-schema related logic.
 */
export default class EventService {
  private static asEventResponse(entity: Event): EventResponse {
    return {
      createdAt: entity.createdAt.toISOString(),
      createdBy: parseUserToResponse(entity.createdBy, false),
      endDate: entity.endDate.toISOString(),
      id: entity.id,
      name: entity.name,
      shifts: [],
      startDate: entity.startDate.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
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
      event: this.asEventResponse(entity.event),
      selected: entity.selected,
      shift: this.asEventShiftResponse(entity.shift),
      user: parseUserToResponse(entity.user, false),
    };
  }

  /**
   * Get all borrel schemas.
   */
  public static async getEvents(params: EventFilterParameters = {})
    :Promise<EventResponse[]> {
    const filterMapping: FilterMapping = {
      name: 'name',
      startDate: 'startDate',
      eventId: 'id',
    };

    const options: FindManyOptions<Event> = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['createdBy', 'shifts'],
      order: { startDate: 'ASC' },
    };

    const events = await Event.find({ ...options });
    const records: EventResponse[] = events.map(
      this.asEventResponse.bind(this),
    );

    return records;
  }

  /**
     * Create borrel schema.
     */
  public static async createEvent(eventRequest: CreateEventParams)
    : Promise<EventResponse> {
    // Create a new Borrel-schema
    const createdBy = await User.findOne({ where: { id: eventRequest.createdById } });
    const shifts = await Promise.all(eventRequest.shiftIds.map(async (shiftId) => {
      const shift = await EventShift.findOne({ where: { id: shiftId } });
      return shift;
    }));
    const newEvent: Event = Object.assign(new Event(), {
      name: eventRequest.name,
      createdBy,
      startDate: new Date(eventRequest.startDate),
      endDate: new Date(eventRequest.endDate),
      shifts,
    });
    // First save the Borrel-schema.
    await Event.save(newEvent);
    return this.asEventResponse(newEvent);
  }

  /**
   * Update borrel schema.
   */
  public static async updateEvent(id: number, update: UpdateEvent) {
    const event = await Event.findOne({ where: { id } });
    if (!event) return undefined;
    event.name = update.name;
    event.startDate = new Date(update.startDate);
    event.endDate = new Date(update.endDate);
    // event.shifts = await Promise.all(update.shifts.map(async (shiftId) => {
    //   const shift = await EventShift.findOne({ where: { id: shiftId } });
    //   return shift;
    // }));
    await Event.save(event);
    return this.asEventResponse(event);
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

  /**
   * Update borrel schema answer availability.
   */
  public static async updateEventAnswerAvailability(
    id: number, update: UpdateEventAnswerAvailability,
  ) {
    const answer = await EventShiftAnswer.findOne({ where: { id } });
    if (!answer) return undefined;
    answer.availability = update.availability;
    await EventShiftAnswer.save(answer);
    return this.asEventAnswerResponse(answer);
  }

  /**
   * Update borrel schema answer selection.
   */
  public static async selectEventAnswer(
    id: number, update: SelectEventAnswer,
  ) {
    const answer = await EventShiftAnswer.findOne({ where: { id } });
    if (!answer) return undefined;
    answer.selected = update.selected;
    await EventShiftAnswer.save(answer);
    return this.asEventAnswerResponse(answer);
  }

  /**
   * Delete borrel schema answer.
   */
  public static async deleteEventParticipantAnswers(
    eventId: number, participantId: number,
  ) {
    const answers = await EventShiftAnswer.find({ where: { event: { id: eventId }, user: { id: participantId } } });
    const answerIds = answers.map((answer) => answer.id);
    await EventShiftAnswer.delete(answerIds);
  }
}
