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
import EventService, { EventFilterParameters, parseEventFilterParameters } from '../service/event-service';
import { EventResponse } from './response/event-response';

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
      },
    };
  }

  public async getAllEvents(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all events by user', req.token.user);

    /* TODO add pagination */

    let filters: EventFilterParameters;
    try {
      filters = parseEventFilterParameters(req);
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // Handle request
    try {
      const events: EventResponse[] = await
      EventService.getEvents(filters);
      res.json(events);
    } catch (e) {
      this.logger.error('Could not return all events:', e);
      res.status(500).json('Internal server error.');
    }
  }
}
