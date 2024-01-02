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
import VatGroupService, {
  canSetVatGroupToDeleted,
  parseGetVatCalculationValuesParams,
  parseGetVatGroupsFilters,
} from '../service/vat-group-service';
import { UpdateVatGroupRequest, VatGroupRequest } from './request/vat-group-request';

function verifyUpdateVatGroup(vr: UpdateVatGroupRequest): boolean {
  return vr.name !== ''
    && typeof vr.deleted === 'boolean';
}

function verifyVatGroup(vr: VatGroupRequest): boolean {
  return verifyUpdateVatGroup(vr)
    && typeof vr.percentage === 'number'
    && vr.percentage >= 0;
}

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
      '/declaration': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'VatGroup', ['*']),
          handler: this.getVatDeclarationAmounts.bind(this),
        },
      },
    };
  }

  /**
   * GET /vatgroups
   * @summary Get a list of all VAT groups
   * @operationId getAllVatGroups
   * @tags vatGroups - Operations of the VAT groups controller
   * @security JWT
   * @param {integer} vatGroupId.query - ID of the VAT group
   * @param {string} name.query - Name of the VAT group
   * @param {number} percentage.query - VAT percentage
   * @param {boolean} deleted.query - Whether the VAT groups should be hidden if zero
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @return {PaginatedVatGroupResponse} 200 - A list of all VAT groups
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
   * GET /vatgroups/{id}
   * @summary Returns the requested VAT group
   * @operationId getSingleVatGroup
   * @tags vatGroups - Operations of the VAT groups controller
   * @security JWT
   * @param {integer} id.path.required - The ID of the VAT group which should be returned
   * @return {VatGroupResponse} 200 - The requested VAT group entity
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
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
   * POST /vatgroups
   * @summary Create a new VAT group
   * @operationId createVatGroup
   * @tags vatGroups - Operations of the VAT group controller
   * @param {VatGroupRequest} request.body.required - The VAT group which should be created
   * @security JWT
   * @return {VatGroupResponse} 200 - The created VAT group entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createVatGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as VatGroupRequest;
    this.logger.trace('Create VAT group', body, 'by user', req.token.user);

    const validBody = verifyVatGroup(body);
    if (!validBody) {
      res.status(400).json('Invalid VAT group.');
      return;
    }

    if (body.deleted) {
      res.status(400).json('Don\'t already soft delete a new VAT group, that\'s stupid.');
    }

    try {
      res.json(await VatGroupService.createVatGroup(body));
    } catch (e) {
      res.status(500).send('Internal server error.');
      this.logger.error(e);
    }
  }

  /**
   * PATCH /vatgroups/{id}
   * @summary Create a new VAT group
   * @operationId updateVatGroup
   * @tags vatGroups - Operations of the VAT group controller
   * @param {integer} id.path.required - The ID of the VAT group which should be updated
   * @param {UpdateVatGroupRequest} request.body.required - The VAT group information
   * @security JWT
   * @return {VatGroupResponse} 200 - The created VAT group entity
   * @return {string} 400 - Validation error
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async updateVatGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateVatGroupRequest;
    const id = Number.parseInt(req.params.id, 10);
    this.logger.trace('Update VAT group', id, 'by user', req.token.user);

    const validBody = verifyUpdateVatGroup(body);
    if (!validBody) {
      res.status(400).json('Invalid VAT group.');
      return;
    }

    try {
      let vatGroup = (await VatGroupService
        .getVatGroups({ vatGroupId: id })).records[0];
      if (!vatGroup) {
        res.status(404).json('VAT group not found.');
        return;
      }

      if (body.deleted) {
        const canDelete = await canSetVatGroupToDeleted(id);
        if (!canDelete) {
          res.status(400).json('Cannot set "deleted" to true, because the VAT group is still used by one or more products.');
          return;
        }
      }

      vatGroup = await VatGroupService.updateVatGroup(id, body);
      res.status(200).json(vatGroup);
    } catch (error) {
      this.logger.error('Could not update VAT group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /vatgroups/declaration
   * @summary Get the VAT collections needed for VAT declarations
   * @operationId getVatDeclarationAmounts
   * @tags vatGroups - Operations of the VAT groups controller
   * @security JWT
   * @param {number} year.query.required - Calendar year for VAT declarations
   * @param {string} period.query.required - Period for VAT declarations
   * @return {PaginatedVatGroupResponse} 200 - A list of all VAT groups with declarations
   */
  public async getVatDeclarationAmounts(req: RequestWithToken, res: Response): Promise<void> {
    let params;
    try {
      params = parseGetVatCalculationValuesParams(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    if (params.year === undefined || params.period === undefined) {
      res.status(400).send('Missing year or period.');
    }

    try {
      const vatGroups = await VatGroupService.calculateVatDeclaration(params);
      res.status(200).json(vatGroups);
    } catch (e) {
      res.status(500).send('Internal server error.');
      this.logger.error(e);
    }
  }
}
