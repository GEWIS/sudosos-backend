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

import BaseController, { BaseControllerOptions } from './base-controller';
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination } from '../helpers/pagination';
import DebtorService from '../service/debtor-service';
import User from '../entity/user/user';
import { asArrayOfDates, asArrayOfUserTypes, asDate } from '../helpers/validators';
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
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Fine', ['*']),
          handler: this.handoutFines.bind(this),
          body: { modelName: 'HandoutFinesRequest' },
        },
      },
      '/notify': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'notify', 'all', 'Fine', ['*']),
          handler: this.notifyAboutFutureFines.bind(this),
          body: { modelName: 'HandoutFinesRequest' },
        },
      },
      '/report': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Fine', ['*']),
          handler: this.getFineReport.bind(this),
        },
      },
    };
  }

  /**
   * GET /fines
   * @summary Get all fine handout events
   * @tags debtors - Operations of the debtor controller
   * @operationId returnAllFineHandoutEvents
   * @security JWT
   * @param {integer} take.query - How many entries the endpoint should return
   * @param {integer} skip.query - How many entries should be skipped (for pagination)
   * @return {PaginatedFineHandoutEventResponse} 200 - All existing fine handout events
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
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
      res.status(400).json(e.message);
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
   * GET /fines/{id}
   * @summary Get all fine handout events
   * @tags debtors - Operations of the debtor controller
   * @operationId returnSingleFineHandoutEvent
   * @security JWT
   * @param {integer} id.path.required - The id of the fine handout event which should be returned
   * @return {FineHandoutEventResponse} 200 - Requested fine handout event with corresponding fines
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
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
   * DELETE /fines/single/{id}
   * @summary Delete a fine
   * @tags debtors - Operations of the debtor controller
   * @operationId deleteFine
   * @security JWT
   * @param {integer} id.path.required - The id of the fine which should be deleted
   * @return 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
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
   * GET /fines/eligible
   * @summary Return all users that had at most -5 euros balance both now and on the reference date.
   *    For all these users, also return their fine based on the reference date.
   * @tags debtors - Operations of the debtor controller
   * @operationId calculateFines
   * @security JWT
   * @param {Array<integer>} userTypes.query - List of all user types fines should be calculated for 1 (MEMBER), 2 (ORGAN), 3 (VOUCHER), 4 (LOCAL_USER), 5 (LOCAL_ADMIN), 6 (INVOICE), 7 (AUTOMATIC_INVOICE).
   * @param {Array<string>} referenceDates.query.required - Dates to base the fines on. Every returned user has at
   *    least five euros debt on every reference date. The height of the fine is based on the first date in the array.
   * @return {Array<UserToFineResponse>} 200 - List of eligible fines
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async calculateFines(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all possible fines by ', req.token.user);

    let params;
    try {
      if (req.query.referenceDates === undefined) throw new Error('referenceDates is required');
      const referenceDates = asArrayOfDates(req.query.referenceDates);
      if (referenceDates === undefined) throw new Error('referenceDates is not a valid array');
      params = {
        userTypes: asArrayOfUserTypes(req.query.userTypes),
        referenceDates,
      };
      if (params.userTypes === undefined && req.query.userTypes !== undefined) throw new Error('userTypes is not a valid array of UserTypes');
    } catch (e) {
      res.status(400).json(e.message);
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
   * POST /fines/handout
   * @summary Handout fines to all given users. Fines will be handed out "now" to prevent rewriting history.
   * @tags debtors - Operations of the debtor controller
   * @operationId handoutFines
   * @security JWT
   * @param {HandoutFinesRequest} request.body.required
   * @return {FineHandoutEventResponse} 200 - Created fine handout event with corresponding fines
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
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
        referenceDate = asDate(body.referenceDate);
      }
    } catch (e) {
      res.status(400).json(e.message);
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

  /**
   * POST /fines/notify
   * @summary Send an email to all given users about their possible future fine.
   * @tags debtors - Operations of the debtor controller
   * @operationId notifyAboutFutureFines
   * @security JWT
   * @param {HandoutFinesRequest} request.body.required
   * @return 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async notifyAboutFutureFines(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as HandoutFinesRequest;
    this.logger.trace('Send future fine notification emails', body, 'by user', req.token.user);

    let referenceDate: Date;
    try {
      // Todo: write code-consistent validator (either /src/controller/request/validators or custom validator.js function)
      if (!Array.isArray(body.userIds)) throw new Error('userIds is not an array');
      const users = await User.find({ where: { id: In(body.userIds) } });
      if (users.length !== body.userIds.length) throw new Error('userIds is not a valid array of user IDs');

      if (body.referenceDate !== undefined) {
        referenceDate = asDate(body.referenceDate);
      }
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      await DebtorService.sendFineWarnings({ referenceDate, userIds: body.userIds });
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not send future fine notification emails:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /fines/report
   * @summary Get a report of all fines
   * @tags debtors - Operations of the debtor controller
   * @operationId getFineReport
   * @security JWT
   * @param {Date} fromDate.query - The start date of the report, inclusive
   * @param {Date} toDate.query - The end date of the report, exclusive
   * @return {FineReportResponse} 200 - The requested report
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async getFineReport(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get fine report by ', req.token.user);

    let fromDate: Date;
    let toDate: Date;
    try {
      fromDate = asDate(req.query.fromDate);
      toDate = asDate(req.query.toDate);
      fromDate.setUTCHours(0, 0, 0, 0);
      toDate.setUTCHours(0, 0, 0, 0);
      if (toDate < fromDate) {
        res.status(400).json('toDate must be after fromDate');
        return;
      }
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const report = await DebtorService.getFineReport(fromDate, toDate);
      res.json(DebtorService.fineReportToResponse(report));
    } catch (error) {
      this.logger.error('Could not get fine report:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
