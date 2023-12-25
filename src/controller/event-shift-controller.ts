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
import BaseController, { BaseControllerOptions } from './base-controller';
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import EventService, { ShiftSelectedCountParams } from '../service/event-service';
import { EventShiftRequest } from './request/event-request';
import EventShift from '../entity/event/event-shift';
import { parseRequestPagination } from '../helpers/pagination';
import { asDate, asEventType } from '../helpers/validators';

export default class EventShiftController extends BaseController {
  private logger: Logger = log4js.getLogger('EventShiftLogger');

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
          handler: this.getAllShifts.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'Event', ['*'],
          ),
          handler: this.createShift.bind(this),
        },
      },
      '/:id(\\d+)': {
        PATCH: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Event', ['*']),
          handler: this.updateShift.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Event', ['*']),
          handler: this.deleteShift.bind(this),
        },
      },
      '/:id(\\d+)/counts': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Event', ['*']),
          handler: this.getShiftSelectedCount.bind(this),
        },
      },
    };
  }

  /**
   * GET /eventshifts
   * @summary Get all event shifts
   * @tags events - Operations of the event controller
   * @operationId getAllEventShifts
   * @security JWT
   * @param {integer} take.query - How many entries the endpoint should return
   * @param {integer} skip.query - How many entries should be skipped (for pagination)
   * @return {PaginatedEventShiftResponse} 200 - All existing event shifts
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async getAllShifts(req: RequestWithToken, res: Response) {
    this.logger.trace('Get all shifts by user', req.token.user);

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

    try {
      const shifts = await EventService.getEventShifts({ take, skip });
      res.json(shifts);
    } catch (e) {
      this.logger.error('Could not return all shifts:', e);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /eventshifts
   * @summary Create an event shift
   * @tags events - Operations of the event controller
   * @operationId createEventShift
   * @security JWT
   * @param {CreateShiftRequest} request.body.required
   * @return {EventShiftResponse} 200 - Created event shift
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createShift(req: RequestWithToken, res: Response) {
    const body = req.body as EventShiftRequest;
    this.logger.trace('Create shift', body, 'by user', req.token.user);

    let params: EventShiftRequest;
    try {
      params = {
        name: req.body.name.toString(),
        roles: req.body.roles,
      };
      if (params.name === '' || !Array.isArray(params.roles)) {
        res.status(400).json('Invalid shift.');
        return;
      }
    } catch (e) {
      res.status(400).json('Invalid shift.');
      return;
    }

    // handle request
    try {
      res.json(await EventService.createEventShift(params));
    } catch (error) {
      this.logger.error('Could not create event shift:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /eventshifts/{id}
   * @summary Update an event shift
   * @tags events - Operations of the event controller
   * @operationId updateEventShift
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be returned
   * @param {UpdateShiftRequest} request.body.required
   * @return {EventShiftResponse} 200 - Created event shift
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async updateShift(req: RequestWithToken, res: Response) {
    const { id: rawId } = req.params;
    const body = req.body as EventShiftRequest;
    this.logger.trace('Update shift', rawId, 'with body', body, 'by user', req.token.user);

    let id = Number.parseInt(rawId, 10);
    try {
      const shift = await EventShift.findOne({ where: { id } });
      if (shift == null) {
        res.status(404).send();
        return;
      }
    } catch (error) {
      this.logger.error('Could not update event:', error);
      res.status(500).json('Internal server error.');
    }

    let param: Partial<EventShiftRequest>;
    try {
      param = {
        name: req.body.name?.toString(),
        roles: req.body.roles,
      };
      if (param.name === '' || (param.roles !== undefined && !Array.isArray(param.roles))) {
        res.status(400).json('Invalid shift.');
        return;
      }
    } catch (e) {
      res.status(400).json('Invalid shift.');
      return;
    }

    // handle request
    try {
      res.json(await EventService.updateEventShift(id, param));
    } catch (error) {
      this.logger.error('Could not update event shift:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /eventshifts/{id}
   * @summary Delete an event shift with its answers
   * @tags events - Operations of the event controller
   * @operationId deleteEventShift
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be deleted
   * @return {string} 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async deleteShift(req: RequestWithToken, res: Response) {
    const { id: rawId } = req.params;
    this.logger.trace('Delete shift with ID', rawId, 'by user', req.token.user);

    try {
      const id = Number.parseInt(rawId, 10);
      const shift = await EventShift.findOne({ where: { id }, withDeleted: true });
      if (shift == null) {
        res.status(404).send();
        return;
      }

      await EventService.deleteEventShift(id);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not delete event shift:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /eventshifts/{id}/counts
   * @summary Get the number of times a user has been selected for the given shift
   * @tags events - Operations of the event controller
   * @operationId getShiftSelectedCount
   * @security JWT
   * @param {integer} id.path.required - The id of the event which should be deleted
   * @param {string} eventType.query - Only include events of this type
   * @param {string} afterDate.query - Only include events after this date
   * @param {string} beforeDate.query - Only include events before this date
   * @return {Array<>PaginatedEventShiftResponse>} 200 - All existing event shifts
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async getShiftSelectedCount(req: RequestWithToken, res: Response) {
    const { id: rawId } = req.params;
    this.logger.trace('Delete shift with ID', rawId, 'by user', req.token.user);

    try {
      const id = Number.parseInt(rawId, 10);
      const shift = await EventShift.findOne({ where: { id } });
      if (shift == null) {
        res.status(404).send();
        return;
      }

      let params: ShiftSelectedCountParams;
      try {
        params = {
          eventType: asEventType(req.query.eventType),
          afterDate: asDate(req.query.afterDate),
          beforeDate: asDate(req.query.beforeDate),
        };
      } catch (e) {
        res.status(400).send(e.message);
        return;
      }

      const counts = await EventService.getShiftSelectedCount(id, params);
      res.json(counts);
    } catch (error) {
      this.logger.error('Could not get event shift counts:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
