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
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { BorrelkaartGroupRequest } from './request/borrelkaart-group-request';
import { RequestWithToken } from '../middleware/token-middleware';
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import BorrelkaartGroupService from '../service/borrelkaart-group-service';
import { parseRequestPagination } from '../helpers/pagination';

export default class BorrelkaartGroupController extends BaseController {
  private logger: Logger = log4js.getLogger('BorrelkaartGroupController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'BorrelkaartGroup', ['*']),
          handler: this.getAllBorrelkaartGroups.bind(this),
        },
        POST: {
          body: { modelName: 'BorrelkaartGroupRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'BorrelkaartGroup', ['*']),
          handler: this.createBorrelkaartGroup.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'BorrelkaartGroup', ['*']),
          handler: this.getBorrelkaartGroupById.bind(this),
        },
        PATCH: {
          body: { modelName: 'BorrelkaartGroupRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'BorrelkaartGroup', ['*']),
          handler: this.updateBorrelkaartGroup.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing borrelkaart groups
   * @route GET /borrelkaartgroups
   * @operationId getALlBorrelkaartgroups
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @security JWT
   * @param {integer} take.query - How many borrelkaart groups the endpoint should return
   * @param {integer} skip.query - How many borrelkaart groups should be skipped (for pagination)
   * @returns {PaginatedBorrelkaartGroupResponse.model} 200 - All existingborrelkaart
   * groups without users
   * @returns {string} 500 - Internal server error
   */
  public async getAllBorrelkaartGroups(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all borrelkaart groups', body, 'by user', req.token.user);

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

    // handle request
    try {
      res.json(await BorrelkaartGroupService.getBorrelkaartGroups({}, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all borrelkaart groups:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a new borrelkaart group
   * @route POST /borrelkaartgroups
   * @operationId createBorrelkaartgroup
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @param {BorrelkaartGroupRequest.model} borrelkaartgroup.body.required -
   * The borrelkaart group which should be created
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The created borrelkaart group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BorrelkaartGroupRequest;
    this.logger.trace('Create borrelkaart group', body, 'by user', req.token.user);

    const borrelkaartGroupParams = BorrelkaartGroupService.asBorrelkaartGroupParams(body);

    // handle request
    try {
      if (!BorrelkaartGroupService.validateBorrelkaartGroup(borrelkaartGroupParams)) {
        res.status(400).json('Invalid borrelkaart group.');
        return;
      }
      res.json(await BorrelkaartGroupService.createBorrelkaartGroup(borrelkaartGroupParams));
    } catch (error) {
      this.logger.error('Could not create borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested borrelkaart group
   * @route GET /borrelkaartgroups/{id}
   * @operationId getBorrelkaartgroupId
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @param {integer} id.path.required - The id of the borrelkaart group which should be returned
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The requested borrelkaart group entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getBorrelkaartGroupById(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const bkgId = Number.parseInt(id, 10);
    this.logger.trace('Get single borrelkaart group', id, 'by user', req.token.user);

    // handle request
    try {
      const bkg = await BorrelkaartGroupService.getBorrelkaartGroups({ bkgId });
      if (bkg.records[0]) {
        res.json(bkg.records[0]);
      } else {
        res.status(404).json('Borrelkaart group not found.');
      }
    } catch (error) {
      this.logger.error('Could not get borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Updates the requested borrelkaart group
   * @route PATCH /borrelkaartgroups/{id}
   * @operationId updateBorrelkaartGroup
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @param {integer} id.path.required - The id of the borrelkaart group which should be updated
   * @param {BorrelkaartGroupRequest.model} borrelkaartgroup.body.required -
   * The updated borrelkaart group
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The requested borrelkaart group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BorrelkaartGroupRequest;
    const { id } = req.params;
    const bkgId = Number.parseInt(id, 10);
    this.logger.trace('Update borrelkaart group', id, 'with', body, 'by user', req.token.user);

    const borrelkaartGroupParams = BorrelkaartGroupService.asBorrelkaartGroupParams(body);

    // handle request
    try {
      if (!BorrelkaartGroupService.validateBorrelkaartGroup(borrelkaartGroupParams)) {
        res.status(400).json('Invalid borrelkaart group.');
        return;
      }
      const bkg = await BorrelkaartGroup.findOne({ where: { id: bkgId } });
      if (!bkg) {
        res.status(404).json('Borrelkaart group not found.');
        return;
      }
      if (bkg.activeStartDate <= new Date()) {
        res.status(403).json('Borrelkaart StartDate has already passed.');
        return;
      }
      if (borrelkaartGroupParams.amount < bkg.amount) {
        res.status(400).json('Cannot decrease number of BorrelkaartGroupUsers');
        return;
      }
      res.status(200).json(
        await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, borrelkaartGroupParams),
      );
    } catch (error) {
      this.logger.error('Could not update borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
