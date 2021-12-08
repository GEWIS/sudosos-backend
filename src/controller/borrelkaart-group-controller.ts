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
import BorrelkaartGroupRequest from './request/borrelkaart-group-request';
import { RequestWithToken } from '../middleware/token-middleware';
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import { addPaginationForFindOptions } from '../helpers/pagination';
import BorrelkaartGroupService from '../service/borrelkaart-group-service';

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
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'BorrelkaartGroup', ['*']),
          handler: this.deleteBorrelkaartGroup.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing borrelkaart groups
   * @route GET /borrelkaartgroups
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @security JWT
   * @returns {Array.<BorrelkaartGroupResponse>} 200 - All existingborrelkaart groups without users
   * @returns {string} 500 - Internal server error
   */
  public async getAllBorrelkaartGroups(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all borrelkaart groups', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(await BorrelkaartGroupService
        .getAllBorrelkaartGroups(addPaginationForFindOptions(req)));
    } catch (error) {
      this.logger.error('Could not return all borrelkaart groups:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a new borrelkaart group
   * @route POST /borrelkaartgroups
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @param {BorrelkaartGroupRequest.model} borrelkaartgroup.body.required -
   * The borrelkaart group which should be created
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The created borrelkaart group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 409 - Conflict error
   * @returns {string} 500 - Internal server error
   */
  public async createBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BorrelkaartGroupRequest;
    this.logger.trace('Create borrelkaart group', body, 'by user', req.token.user);

    // handle request
    try {
      if (await BorrelkaartGroupService.verifyBorrelkaartGroup(body)) {
        if (await BorrelkaartGroupService.checkUserConflicts(body)) {
          res.json(await BorrelkaartGroupService.createBorrelkaartGroup(body));
        } else {
          res.status(409).json('Conflicting user posted.');
        }
      } else {
        res.status(400).json('Invalid borrelkaart group.');
      }
    } catch (error) {
      this.logger.error('Could not create borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested borrelkaart group
   * @route GET /borrelkaartgroups/{id}
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @param {integer} id.path.required - The id of the borrelkaart group which should be returned
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The requested borrelkaart group entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getBorrelkaartGroupById(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single borrelkaart group', id, 'by user', req.token.user);

    // handle request
    try {
      const bkg = await BorrelkaartGroupService.getBorrelkaartGroupById(id);
      if (bkg) {
        res.json(bkg);
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
    this.logger.trace('Update borrelkaart group', id, 'by user', req.token.user);

    // handle request
    try {
      if (await BorrelkaartGroupService.verifyBorrelkaartGroup(body)) {
        if (await BorrelkaartGroup.findOne(id)) {
          if (await BorrelkaartGroupService.checkUserConflicts(body, parseInt(id, 10))) {
            res.status(200).json(await BorrelkaartGroupService.updateBorrelkaartGroup(id, body));
          } else {
            res.status(409).json('Conflicting user posted.');
          }
        } else {
          res.status(404).json('Borrelkaart group not found.');
        }
      } else {
        res.status(400).json('Invalid borrelkaart group.');
      }
    } catch (error) {
      this.logger.error('Could not update borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Deletes the requested borrelkaart group
   * @route DELETE /borrelkaartgroups/{id}
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @param {integer} id.path.required - The id of the borrelkaart group which should be deleted
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The deleted borrelkaart group entity
   * @returns {string} 404 - Not found error
   */
  public async deleteBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Remove borrelkaart group', id, 'by user', req.token.user);

    // handle request
    try {
      if (await BorrelkaartGroup.findOne(id)) {
        res.status(200).json(await BorrelkaartGroupService.deleteBorrelkaartGroup(id));
      } else {
        res.status(404).json('Borrelkaart group not found.');
      }
    } catch (error) {
      this.logger.error('Could not delete borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
