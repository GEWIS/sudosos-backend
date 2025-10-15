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

import BaseController, { BaseControllerOptions } from './base-controller';
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination } from '../helpers/pagination';
import InactiveAdministrativeCostService, { parseInactiveAdministrativeCostFilterParameters, InactiveAdministrativeCostFilterParameters } from '../service/inactive-administrative-cost-service';
import { PaginatedInactiveAdministrativeCostResponse } from './response/inactive-administrative-cost-response';
import { isFail } from '../helpers/specification-validation';
import {
  CreateInactiveAdministrativeCostRequest,
  HandoutInactiveAdministrativeCostsRequest,
} from './request/inactive-administrative-cost-request';
import { NotImplementedError } from '../errors';
import verifyValidUserId from './request/validators/inactive-administrative-cost-request-spec';
import InactiveAdministrativeCost from '../entity/transactions/inactive-administrative-cost';
import User from '../entity/user/user';
import { In } from 'typeorm';
import { asBoolean } from '../helpers/validators';


export default class InactiveAdministrativeCostController extends BaseController {
  private logger: Logger = log4js.getLogger('InactiveAdministrativeCostLogger');

  /**
   * Creates a new InactiveAdministrativeCost controller instance
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
     * @inheritDoc
     */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.getAllInactiveAdministrativeCosts.bind(this),
        },
        POST: {
          body: { modelName: 'CreateInactiveAdministrativeCostRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.createInactiveAdministrativeCost.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.getSingleInactiveAdministrativeCost.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.deleteInactiveAdministrativeCost.bind(this),
        },
      },
      '/checkInactiveUsers': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.checkInactiveUsers.bind(this),
        },
      },
      '/notify': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'notify', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.notifyInactiveUsers.bind(this),
          body: { modelName: 'HandoutInactiveAdministrativeCostsRequest' },
        },
      },
      '/handout': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.handoutInactiveAdministrativeCost.bind(this),
          body: { modelName: 'HandoutInactiveAdministrativeCostsRequest' },
        },
      },
    };
  }

  /**
   * GET /inactiveAdministrativeCosts
   * @summary Returns all inactive administrative costs in the system.
   * @operationId getAllInactiveAdministrativeCosts
   * @tags inactiveAdministrativeCosts - Operations of the invoices controller
   * @security JWT
   * @param {integer} fromId.query - Filter on the id of the user
   * @param {integer} inactiveAdministrativeCostId.query - Filter on the id of entity
   * @return {PaginatedInvoiceResponse} 200 - All existing inactive administrative costs
   * @return {string} 500 - Internal server error
   */
  public async getAllInactiveAdministrativeCosts(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all inactive administrative costs', body, 'by user', req.token.user);

    let take;
    let skip;
    let filter: InactiveAdministrativeCostFilterParameters;

    try {
      const pagination = parseRequestPagination(req);
      filter = parseInactiveAdministrativeCostFilterParameters(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // Handle request
    try {
      const inactiveAdministrativeCosts: PaginatedInactiveAdministrativeCostResponse = await new InactiveAdministrativeCostService().getPaginatedInactiveAdministrativeCosts(
        filter, { take, skip },
      );
      res.json(inactiveAdministrativeCosts);
    } catch (error) {
      this.logger.error('Could not return all inactive administrative costs', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /inactiveAdministrativeCost/{id}
   * @summary Returns a single inactive administrative cost entity
   * @operationId getSingleInactiveAdministrativeCost
   * @param {integer} id.path.required - The id of the requested inactive administrative cost
   * @tags inactiveAdministrativeCosts - Operations of the invoices controller
   * @security JWT
   * @return {BaseInactiveAdministrativeCostResponse} 200 - All existing inactive administrative cost
   * @return {string} 404 - InactiveAdministrativeCost not found
   * @return {string} 500 - Internal server error
   */
  public async getSingleInactiveAdministrativeCost(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const inactiveAdministrativeCostId = parseInt(id, 10);
    this.logger.trace('Get inactive administrative costs', inactiveAdministrativeCostId, 'by user', req.token.user);

    try {
      const inactiveAdministrativeCosts: InactiveAdministrativeCost[] = await new InactiveAdministrativeCostService().getInactiveAdministrativeCosts(
        { inactiveAdministrativeCostId },
      );

      const inactiveAdministrativeCost = inactiveAdministrativeCosts[0];
      if (!inactiveAdministrativeCost) {
        res.status(404).json('Unknown inactive administrative cost ID.');
        return;
      }
      const response = InactiveAdministrativeCostService.asInactiveAdministrativeCostResponse(inactiveAdministrativeCost);

      res.json(response);
    } catch (error) {
      this.logger.error('Could not return inactive administrative cost', error);
      res.status(500).json('Internal server error.');
    }

  }

  /**
   * POST /inactiveAdministrativeCost
   * @summary Adds and inactive administrative cost to the system.
   * @operationId createInactiveAdministrativeCost
   * @tags inactiveAdministrativeCosts - Operations of the inactive administrative cost controller
   * @security JWT
   * @param {CreateInactiveAdministrativeCostRequest} request.body.required -
   * The inactive administrative cost which should be created
   * @return {BaseInactiveAdministrativeCostResponse} 200 - The created inactive administrative cost entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createInactiveAdministrativeCost(req: RequestWithToken, res: Response): Promise<void> {
    const body   = req.body as CreateInactiveAdministrativeCostRequest;
    this.logger.trace('Create InactiveAdministrativeCosts', body, 'by user', req.token.user);

    // handle request
    try {
      const validation = await verifyValidUserId(body);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const inactiveAdministrativeCost = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost(body);
      res.json(InactiveAdministrativeCostService.asInactiveAdministrativeCostResponse(inactiveAdministrativeCost));
    } catch (error) {
      if (error instanceof NotImplementedError) {
        res.status(501).json(error.message);
        return;
      }
      this.logger.error('Could not create inactive administrative cost:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /inactiveAdministrativeCost/{id}
   * @summary Deletes an inactive administrative cost.
   * @operationId deleteInactiveAdministrativeCost
   * @tags inactiveAdministrativeCosts - Operations of the inactive administrative cost controller
   * @security JWT
   * @param {integer} id.path.required - The id of the inactive administrative cost which should be deleted.
   * @return {string} 404 - Invoice not found
   * @return 204 - Deletion success
   * @return {string} 500 - Internal server error
   */
  public async deleteInactiveAdministrativeCost(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const inactiveAdministrativeCostId = parseInt(id, 10);
    this.logger.trace('Delete inactive administrative costs', inactiveAdministrativeCostId, 'by user', req.token.user);

    try {
      const inactiveAdministrativeCost = await new InactiveAdministrativeCostService().deleteInactiveAdministrativeCost(inactiveAdministrativeCostId);
      if (!inactiveAdministrativeCost) {
        res.status(404).json('InactiveAdministrativeCost not found.');
      }
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not delete InactiveAdministrativeCost:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /checkInactiveUsers
   * @summary Find all users who are eligible for notification or creation of inactive administrative cost
   * @operationId checkInactiveUsers
   * @tags inactiveAdministrativeCosts - Operations of the inactive administrative cost controller
   * @security JWT
   * @param {boolean} notification.query - Whether to check for notification or for fine.
   * @return {Array<UserToInactiveAdministrativeCostResponse>} 200 - List of eligible users
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async checkInactiveUsers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Check Inactive Users', body, 'by user', req.token.user);

    try {
      const notification = asBoolean(req.query.notification);

      const usersResponses = await new InactiveAdministrativeCostService().checkInactiveUsers({ notification });

      res.json(usersResponses);
    } catch (error) {
      this.logger.error('Could not check inactive users:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /notify
   * @summary Notify all users which will pay administrative costs within a year
   * @operationId notifyInactiveUsers
   * @tags inactiveAdministrativeCosts - Operations of the inactive administrative cost controller
   * @security JWT
   * @param {HandoutInactiveAdministrativeCostsRequest} request.body.required -
   * The users that should be notified
   * @return 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async notifyInactiveUsers(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as HandoutInactiveAdministrativeCostsRequest;
    this.logger.trace('Notify Inactive Users', body, 'by user', req.token.user);

    try {
      if (!Array.isArray(body.userIds)) throw new Error('userIds is not an Array.');
      
      const users = await User.find({ where: { id: In(body.userIds) } });
      if (users.length !== body.userIds.length) throw new Error('userIds is not a valid array of user IDs');
    } catch (error) {
      res.status(400).json(error.message);
      return ;
    }

    try {
      await new InactiveAdministrativeCostService().sendInactiveNotification(body);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not check inactive users:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /handout
   * @summary Handout inactive administrative costs to all users who are eligible.
   * @operationId handoutAdministrativeCostInactiveUsers
   * @tags inactiveAdministrativeCosts - Operations of the inactive administrative cost controller
   * @security JWT
   * @param {HandoutInactiveAdministrativeCostsRequest} request.body.required -
   * The users that should be fined
   * @return 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async handoutInactiveAdministrativeCost(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as HandoutInactiveAdministrativeCostsRequest;
    this.logger.trace('Notify Inactive Users', body, 'by user', req.token.user);

    try {
      if (!Array.isArray(body.userIds)) throw new Error('userIds is not an Array.');

      const users = await User.find({ where: { id: In(body.userIds) } });
      if (users.length !== body.userIds.length) throw new Error('userIds is not a valid array of user IDs');
    } catch (error) {
      res.status(400).json(error.message);
      return ;
    }

    try {
      const inactiveAdministrativeCosts = await new InactiveAdministrativeCostService().handOutInactiveAdministrativeCost(body);
      const response = InactiveAdministrativeCostService.toArrayResponse(inactiveAdministrativeCosts);

      res.status(200).send(response);
    } catch (error) {
      this.logger.error('Could not check inactive users:', error);
      res.status(500).json('Internal server error.');
    }
  }


}
