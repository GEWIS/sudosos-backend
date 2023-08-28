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

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import EventService, {
  CreateEventParams,
  EventFilterParameters,
  parseEventFilterParameters, parseUpdateEventRequestParameters, UpdateEventParams,
} from '../service/event-service';
import { parseRequestPagination } from '../helpers/pagination';
import { EventRequest } from './request/event-request';

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
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Event', ['*']),
          handler: this.deleteEvent.bind(this),
        },
      },
    };
  }

  /**
   * Get all events
   * @route GET /events
   * @group events - Operations of the event controller
   * @operationId getAllEvents
   * @security JWT
   * @param {string} name.query - Name of the event
   * @param {integer} createdById.query - ID of user that created the event
   * @param {string} beforeDate.query - Get only events that start after this date
   * @param {string} afterDate.query - Get only events that start before this date
   * @param {integer} take.query - How many entries the endpoint should return
   * @param {integer} skip.query - How many entries should be skipped (for pagination)
   * @returns {PaginatedBaseEventResponse.model} 200 - All existing events
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
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
      res.status(400).send(e.message);
      return;
    }

    let filters: EventFilterParameters;
    try {
      filters = parseEventFilterParameters(req);
    } catch (e) {
      res.status(400).send(e.message);
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
   * Get a single event with its answers and shifts
   * @route GET /events/{id}
   * @group events - Operations of the event controller
   * @operationId getSingleEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be returned
   * @returns {EventResponse.model} 200 - All existing events
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
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
   * Create an event with its corresponding answers objects
   * @route POST /events
   * @group events - Operations of the event controller
   * @operationId createEvent
   * @security JWT
   * @param {CreateEventRequest.model} body.body.required
   * @returns {EventResponse.model} 200 - Created event
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
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
   * Update an event with its corresponding answers objects
   * @route PATCH /events/{id}
   * @group events - Operations of the event controller
   * @operationId updateEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be returned
   * @param {UpdateEventRequest.model} body.body.required
   * @returns {EventResponse.model} 200 - Created event
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
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
   * Delete an event with its answers
   * @route DELETE /events/{id}
   * @group events - Operations of the event controller
   * @operationId deleteEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be deleted
   * @returns {string} 204 - Success
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
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
}
