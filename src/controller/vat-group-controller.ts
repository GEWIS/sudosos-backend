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
import { parseRequestPagination } from '../helpers/pagination';
import VatGroupService, { parseGetVatGroupsFilters } from '../service/vat-group-service';
import { UpdateVatGroupRequest, VatGroupRequest } from './request/vat-group-request';

export default class VatGroupController extends BaseController {
  private logger: Logger = log4js.getLogger('VatGroupController');

  /**
   * Creates a new VAT Group controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'VatGroup', ['*']),
          handler: this.getAllVatGroups.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'VatGroup', ['*']),
          handler: this.createVatGroup.bind(this),
          body: { modelName: 'VatGroupRequest' },
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'VatGroup', ['*']),
          handler: this.getSingleVatGroup.bind(this),
        },
        PATCH: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'VatGroup', ['*']),
          handler: this.updateVatGroup.bind(this),
        },
      },
    };
  }

  /**
   * Get a list of all VAT groups
   * @route GET /vatgroups
   * @group vatGroups - Operations of the VAT groups controller
   * @security JWT
   * @param {integer} vatGroupId.query - ID of the VAT group
   * @param {string} name.query - Name of the VAT group
   * @param {number} percentage.query - VAT percentage
   * @param {boolean} hideIfZero.query - Whether the VAT groups should be hidden if zero
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @returns {PaginatedVatGroupResponse.model} 200 - A list of all VAT groups
   */
  public async getAllVatGroups(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all VAT groups by user', req.token.user);

    // Parse the filters given in the query parameters. If there are any issues,
    // the parse method will throw an exception. We will then return a 400 error.
    let filters;
    let take;
    let skip;
    try {
      filters = parseGetVatGroupsFilters(req);
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const vatGroups = await VatGroupService.getVatGroups(filters, { take, skip });
      res.status(200).json(vatGroups);
    } catch (e) {
      res.status(500).send('Internal server error.');
      this.logger.error(e);
    }
  }

  /**
   * Returns the requested VAT group
   * @route GET /vatgroups/{id}
   * @group vatGroups - Operations of the VAT groups controller
   * @security JWT
   * @param {integer} id.path.required - The ID of the VAT group which should be returned
   * @returns {VatGroup.model} 200 - The requested VAT group entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getSingleVatGroup(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single VAT group', id, ' by user', req.token.user);

    try {
      const { records } = await VatGroupService.getVatGroups({
        vatGroupId: Number.parseInt(id, 10),
      });
      if (records.length > 0) {
        res.json(records[0]);
      } else {
        res.status(404).json('VAT group not found.');
      }
    } catch (error) {
      this.logger.error('Could not return VAT group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Create a new VAT group
   * @route POST /vatgroups
   * @group vatGroups - Operations of the VAT group controller
   * @param {VatGroupRequest.model} vatGroup.body.required - The VAT group which should be created
   * @security JWT
   * @returns {VatGroup.model} 200 - The created VAT group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createVatGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as VatGroupRequest;
    this.logger.trace('Create VAT group', body, 'by user', req.token.user);

    try {
      if (VatGroupService.verifyVatGroup(body)) {
        res.json(await VatGroupService.createVatGroup(body));
      } else {
        res.status(400).json('Invalid VAT group.');
      }
    } catch (e) {
      res.status(500).send('Internal server error.');
      this.logger.error(e);
    }
  }

  /**
   * Create a new VAT group
   * @route PATCH /vatgroups/{id}
   * @group vatGroups - Operations of the VAT group controller
   * @param {integer} id.path.required - The ID of the VAT group which should be updated
   * @param {UpdateVatGroupRequest.model} vatGroup.body.required - The VAT group information
   * @security JWT
   * @returns {VatGroup.model} 200 - The created VAT group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateVatGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateVatGroupRequest;
    const { id } = req.params;
    this.logger.trace('Update VAT group', id, 'by user', req.token.user);

    try {
      if (VatGroupService.verifyUpdateVatGroup(body)) {
        const vatGroup = await VatGroupService.updateVatGroup(Number.parseInt(id, 10), body);
        if (vatGroup) {
          res.json(vatGroup);
        } else {
          res.status(404).json('VAT group not found.');
        }
      } else {
        res.status(400).json('Invalid VAT group.');
      }
    } catch (error) {
      this.logger.error('Could not update VAT group:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
