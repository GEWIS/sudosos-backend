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
 *
 *  @license
 */

/**
 * This is the module page of event-controller.
 *
 * @module events
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import EventService, {
  CreateEventParams,
  EventFilterParameters,
  parseEventFilterParameters, parseUpdateEventRequestParameters, UpdateEventAnswerParams, UpdateEventParams,
} from '../service/event-service';
import { parseRequestPagination } from '../helpers/pagination';
import { EventAnswerAssignmentRequest, EventAnswerAvailabilityRequest, EventRequest } from './request/event-request';
import Event from '../entity/event/event';
import EventShiftAnswer from '../entity/event/event-shift-answer';
import { asShiftAvailability } from '../helpers/validators';

/**
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */
export default class EventController extends BaseController {
  private logger: Logger = log4js.getLogger('EventLogger');

  /**
   * Create a new user controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(
    options: BaseControllerOptions,
  ) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', 'all', 'Event', ['*'],
          ),
          handler: this.getAllEvents.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'Event', ['*'],
          ),
          body: { modelName: 'CreateEventRequest' },
          handler: this.createEvent.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Event', ['*']),
          handler: this.getSingleEvent.bind(this),
        },
        PATCH: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Event', ['*']),
          handler: this.updateEvent.bind(this),
          body: { modelName: 'UpdateEventRequest' },
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Event', ['*']),
          handler: this.deleteEvent.bind(this),
        },
      },
      '/:id(\\d+)/sync': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Event', ['*']),
          handler: this.syncEventShiftAnswers.bind(this),
        },
      },
      '/:eventId(\\d+)/shift/:shiftId(\\d+)/user/:userId(\\d+)/assign': {
        PUT: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'assign', 'all', 'EventAnswer', ['*']),
          handler: this.assignEventShift.bind(this),
          body: { modelName: 'EventAnswerAssignmentRequest' },
        },
      },
      '/:eventId(\\d+)/shift/:shiftId(\\d+)/user/:userId(\\d+)/availability': {
        PUT: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'assign', EventController.getRelation(req), 'EventAnswer', ['*']),
          handler: this.updateShiftAvailability.bind(this),
          body: { modelName: 'EventAnswerAvailabilityRequest' },
        },
      },
    };
  }

  private static getRelation(req: RequestWithToken): string {
    return req.params.userId === req.token.user.id.toString() ? 'own' : 'all';
  }

  /**
   * GET /events
   * @summary Get all events
   * @tags events - Operations of the event controller
   * @operationId getAllEvents
   * @security JWT
   * @param {string} name.query - Name of the event
   * @param {integer} createdById.query - ID of user that created the event
   * @param {string} beforeDate.query - Get only events that start after this date
   * @param {string} afterDate.query - Get only events that start before this date
   * @param {string} type.query - Get only events that are this type
   * @param {integer} take.query - How many entries the endpoint should return
   * @param {integer} skip.query - How many entries should be skipped (for pagination)
   * @return {PaginatedBaseEventResponse} 200 - All existing events
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async getAllEvents(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all events by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    let filters: EventFilterParameters;
    try {
      filters = parseEventFilterParameters(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    // Handle request
    try {
      const events = await EventService.getEvents(filters, { take, skip });
      res.json(events);
    } catch (e) {
      this.logger.error('Could not return all events:', e);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /events/{id}
   * @summary Get a single event with its answers and shifts
   * @tags events - Operations of the event controller
   * @operationId getSingleEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be returned
   * @return {EventResponse} 200 - All existing events
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async getSingleEvent(req: RequestWithToken, res: Response) {
    const { id } = req.params;
    this.logger.trace('Get single event with ID', id, 'by', req.token.user);

    try {
      const parsedId = Number.parseInt(id, 10);
      const event = await EventService.getSingleEvent(parsedId);
      if (event == null) {
        res.status(404).send();
        return;
      }
      res.json(event);
    } catch (error) {
      this.logger.error('Could not return single event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /events
   * @summary Create an event with its corresponding answers objects
   * @tags events - Operations of the event controller
   * @operationId createEvent
   * @security JWT
   * @param {CreateEventRequest} request.body.required
   * @return {EventResponse} 200 - Created event
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async createEvent(req: RequestWithToken, res: Response) {
    const body = req.body as EventRequest;
    this.logger.trace('Create event', body, 'by user', req.token.user);

    let params: CreateEventParams;
    try {
      params = {
        ...await parseUpdateEventRequestParameters(req),
        createdById: req.token.user.id,
      };
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    // handle request
    try {
      res.json(await EventService.createEvent(params));
    } catch (error) {
      this.logger.error('Could not create event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /events/{id}
   * @summary Update an event with its corresponding answers objects
   * @tags events - Operations of the event controller
   * @operationId updateEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be returned
   * @param {UpdateEventRequest} request.body.required
   * @return {EventResponse} 200 - Created event
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async updateEvent(req: RequestWithToken, res: Response) {
    const { id } = req.params;
    const body = req.body as EventRequest;
    this.logger.trace('Update event', id, 'with body', body, 'by user', req.token.user);

    let parsedId = Number.parseInt(id, 10);
    try {
      const event = await EventService.getSingleEvent(parsedId);
      if (event == null) {
        res.status(404).send();
        return;
      }
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
    }

    let params: Partial<UpdateEventParams>;
    try {
      params = {
        ...await parseUpdateEventRequestParameters(req, true, parsedId),
      };
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    // handle request
    try {
      res.json(await EventService.updateEvent(parsedId, params));
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /events/{id}
   * @summary Delete an event with its answers
   * @tags events - Operations of the event controller
   * @operationId deleteEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be deleted
   * @return 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async deleteEvent(req: RequestWithToken, res: Response) {
    const { id } = req.params;
    this.logger.trace('Get single event with ID', id, 'by', req.token.user);

    try {
      const parsedId = Number.parseInt(id, 10);
      const event = await EventService.getSingleEvent(parsedId);
      if (event == null) {
        res.status(404).send();
        return;
      }

      await EventService.deleteEvent(parsedId);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not delete event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Synchronize an event, so that EventShiftAnswers are created/deleted
   * for users that are (no longer) part of a shift
   * @route GET /events/{id}/sync
   * @tags events - Operations of the event controller
   * @operationId syncEventShiftAnswers
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be returned
   * @return {EventResponse} 200 - All existing events
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async syncEventShiftAnswers(req: RequestWithToken, res: Response) {
    const { id } = req.params;
    this.logger.trace('Synchronise single event with ID', id, 'by', req.token.user);

    try {
      const parsedId = Number.parseInt(id, 10);
      const event = await Event.findOne({ where: { id: parsedId }, relations: ['answers', 'shifts'] });
      if (event == null) {
        res.status(404).send();
        return;
      }

      await EventService.syncEventShiftAnswers(event);
      res.status(200).json(await EventService.getSingleEvent(parsedId));
    } catch (error) {
      this.logger.error('Could not synchronize event answers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PUT /events/{eventId}/shift/{shiftId}/user/{userId}/assign
   * @summary Change the assignment of users to shifts on an event
   * @tags events - Operations of the event controller
   * @operationId assignEventShift
   * @security JWT
   * @param {integer} eventId.path.required - The id of the event
   * @param {integer} shiftId.path.required - The id of the shift
   * @param {integer} userId.path.required - The id of the user
   * @param {EventAnswerAssignmentRequest} request.body.required
   * @return {BaseEventAnswerResponse} 200 - Created event
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async assignEventShift(req: RequestWithToken, res: Response) {
    const { eventId: rawEventId, shiftId: rawShiftId, userId: rawUserId } = req.params;
    const body = req.body as EventAnswerAssignmentRequest;
    this.logger.trace('Update event shift selection for event', rawEventId, 'for shift', rawShiftId, 'for user', rawUserId, 'by', req.token.user);

    let eventId = Number.parseInt(rawEventId, 10);
    let shiftId = Number.parseInt(rawShiftId, 10);
    let userId = Number.parseInt(rawUserId, 10);
    try {
      const answer = await EventShiftAnswer.findOne({ where: { eventId, shiftId, userId }, relations: ['event'] });
      if (answer == null) {
        res.status(404).send();
        return;
      }
      if (answer.event.startDate.getTime() < new Date().getTime()) {
        res.status(400).json('Event has already started or is already over.');
        return;
      }
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
      return;
    }

    let params: Partial<UpdateEventAnswerParams> = {
      selected: body.selected,
    };

    // handle request
    try {
      const answer = await EventService.updateEventShiftAnswer(eventId, shiftId, userId, params);
      res.json(answer);
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /events/{eventId}/shift/{shiftId}/user/{userId}/availability
   * @summary Update the availability of a user for a shift in an event
   * @tags events - Operations of the event controller
   * @operationId updateEventShiftAvailability
   * @security JWT
   * @param {integer} eventId.path.required - The id of the event
   * @param {integer} shiftId.path.required - The id of the shift
   * @param {integer} userId.path.required - The id of the user
   * @param {EventAnswerAvailabilityRequest} request.body.required
   * @return {BaseEventAnswerResponse} 200 - Created event
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
   */
  public async updateShiftAvailability(req: RequestWithToken, res: Response) {
    const { userId: rawUserId, shiftId: rawShiftId, eventId: rawEventId } = req.params;
    const body = req.body as EventAnswerAvailabilityRequest;
    this.logger.trace('Update event shift availability for user', rawUserId, 'for shift', rawShiftId, 'for event', rawEventId, 'by', req.token.user);

    let userId = Number.parseInt(rawUserId, 10);
    let shiftId = Number.parseInt(rawShiftId, 10);
    let eventId = Number.parseInt(rawEventId, 10);
    try {
      const answer = await EventShiftAnswer.findOne({ where: { eventId, shiftId, userId }, relations: ['event'] });
      if (answer == null) {
        res.status(404).send();
        return;
      }
      if (answer.event.startDate.getTime() < new Date().getTime()) {
        res.status(400).json('Event has already started or is already over.');
        return;
      }
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
      return;
    }

    let params: Partial<UpdateEventAnswerParams>;
    try {
      params = {
        availability: asShiftAvailability(body.availability),
      };
    } catch (e) {
      res.status(400).json('Invalid event availability.');
      return;
    }

    // handle request
    try {
      const answer = await EventService.updateEventShiftAnswer(eventId, shiftId, userId, params);
      res.json(answer);
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
