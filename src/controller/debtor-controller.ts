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
import { parseRequestPagination } from '../helpers/pagination';
import DebtorService from '../service/debtor-service';
import User from '../entity/user/user';
import { asArrayOfUserTypes, asDate } from '../helpers/validators';
import { In } from 'typeorm';
import { HandoutFinesRequest } from './request/debtor-request';
import Fine from '../entity/fine/fine';

export default class DebtorController extends BaseController {
  private logger: Logger = log4js.getLogger(' DebtorController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Fine', ['*']),
          handler: this.returnAllFineHandoutEvents.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Fine', ['*']),
          handler: this.returnSingleFineHandoutEvent.bind(this),
        },
      },
      '/single/:id(\\d+)': {
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Fine', ['*']),
          handler: this.deleteFine.bind(this),
        },
      },
      '/eligible': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Fine', ['*']),
          handler: this.calculateFines.bind(this),
        },
      },
      '/handout': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Fine', ['*']),
          handler: this.handoutFines.bind(this),
        },
      },
    };
  }

  /**
   * Get all fine handout events
   * @route GET /fines
   * @group debtors - Operations of the debtor controller
   * @security JWT
   * @param {integer} take.query - How many entries the endpoint should return
   * @param {integer} skip.query - How many entries should be skipped (for pagination)
   * @returns {PaginatedFineHandoutEventResponse.model} 200 - All existing fine handout events
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async returnAllFineHandoutEvents(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all fine handout events by ', req.token.user);

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
      res.json(await DebtorService.getFineHandoutEvents({ take, skip }));
    } catch (error) {
      this.logger.error('Could not return all fine handout event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get all fine handout events
   * @route GET /fines/{id}
   * @group debtors - Operations of the debtor controller
   * @security JWT
   * @param {integer} id.path.required - The id of the fine handout event which should be returned
   * @returns {FineHandoutEventResponse.model} 200 - Requested fine handout event with corresponding fines
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleFineHandoutEvent(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get fine handout event', id, 'by', req.token.user);

    try {
      res.json(await DebtorService.getSingleFineHandoutEvent(Number.parseInt(id, 10)));
    } catch (error) {
      this.logger.error('Could not return fine handout event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Delete a fine
   * @route DELETE /fines/{id}
   * @group debtors - Operations of the debtor controller
   * @security JWT
   * @param {integer} id.path.required - The id of the fine which should be deleted
   * @returns {} 204 - Success
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async deleteFine(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete fine', id, 'by', req.token.user);

    try {
      const parsedId = Number.parseInt(id, 10);
      const fine = await Fine.findOne({ where: { id: parsedId } });
      if (fine == null) {
        res.status(404).send();
        return;
      }

      await DebtorService.deleteFine(parsedId);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not return fine handout event:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Return all users that had at most -5 euros balance both now and on the reference date
   * For all these users, also return their fine based on the reference date.
   * @route GET /fines/eligible
   * @group debtors - Operations of the debtor controller
   * @security JWT
   * @param {Array<string>} userTypes.query.required - List of all user types fines should be calculated for
   * @param {string} referenceDate.query - Date to base fines on. If undefined, use now.
   * @returns {Array<UserToFineResponse.model>} 200 - List of eligible fines
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async calculateFines(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all possible fines by ', req.token.user);

    let params;
    try {
      params = {
        userTypes: asArrayOfUserTypes(req.query.userTypes),
        referenceDate: asDate(req.query.referenceDate),
      };
      if (params.userTypes === undefined) throw new Error('userTypes is not a valid array of UserTypes');
      if (params.referenceDate === undefined && req.query.referenceDate !== undefined) throw new Error('referenceDate is not a valid date');
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      res.json(await DebtorService.calculateFinesOnDate(params));
    } catch (error) {
      this.logger.error('Could not calculate fines:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Handout fines to all given users.
   * @route POST /fines/handout
   * @group debtors - Operations of the debtor controller
   * @security JWT
   * @param {HandoutFinesRequest.model} body.body.required
   * @returns {FineHandoutEventResponse.model} 200 - Created fine handout event with corresponding fines
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async handoutFines(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as HandoutFinesRequest;
    this.logger.trace('Handout fines', body, 'by user', req.token.user);

    let referenceDate: Date;
    try {
      // Todo: write code-consistent validator (either /src/controller/request/validators or custom validator.js function)
      if (!Array.isArray(body.userIds)) throw new Error('userIds is not an array');
      const users = await User.find({ where: { id: In(body.userIds) } });
      if (users.length !== body.userIds.length) throw new Error('userIds is not a valid array of user IDs');

      if (body.referenceDate !== undefined) {
        referenceDate = new Date(body.referenceDate);
        if (Number.isNaN(referenceDate.getTime())) throw new Error('referenceDate is not a valid date');
      }
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const result = await DebtorService.handOutFines({ referenceDate, userIds: body.userIds }, req.token.user);
      res.json(result);
    } catch (error) {
      this.logger.error('Could not handout fines:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
