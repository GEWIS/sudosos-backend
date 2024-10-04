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
import { CreateInactiveAdministrativeCostRequest } from './request/inactive-administrative-cost-request';
import { NotImplementedError } from '../errors';
import verifyValidUserId from './request/validators/inactive-administrative-cost-request-spec';

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
          body: { modelName: '' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'InactiveAdministrativeCost', ['*']),
          handler: this.createInactiveAdministrativeCost.bind(this),
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
   * @param {integer} inactiveAdministrativeCostId.query - Filter on the entity
   * @param {boolean} notification.query - Boolean to check users for notification or for fine
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
   * POST /inactiveAdministrativeCost
   * @summary Adds and inactive administrative cost to the system.
   * @operationId createInactiveAdministrativeCost
   * @tags inactiveAdministrativeCosts - Operations of the invoices controller
   * @security JWT
   * @param {CreateInactiveAdministrativeCostRequest} request.body.required -
   * The inactive administrative cost which should be created
   * @return {BaseInactiveAdministrativeCostResponse} 200 - The created inactive administrative cost entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createInactiveAdministrativeCost(req: RequestWithToken, res: Response): Promise<void> {
    const body  = req.body as CreateInactiveAdministrativeCostRequest;
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

}
