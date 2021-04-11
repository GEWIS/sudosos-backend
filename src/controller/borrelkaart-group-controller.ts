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
import { SwaggerSpecification } from 'swagger-model-validator';
import BaseController from './base-controller';
import Policy from './policy';
import BorrelkaartGroupRequest from './request/borrelkaart-group-request';
import { RequestWithToken } from '../middleware/token-middleware';
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import { UserType } from '../entity/user/user';
import { addPaginationForFindOptions } from '../helpers/pagination';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';
import BorrelkaartGroupResponse from './response/borrelkaart-group-response';

export default class BorrelkaartGroupController extends BaseController {
  private logger: Logger = log4js.getLogger('BorrelkaartGroupController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: this.isAdmin.bind(this),
          handler: this.returnAllBorrelkaartGroups.bind(this),
        },
        POST: {
          body: { modelName: 'BorrelkaartGroupRequest' },
          policy: this.isAdmin.bind(this),
          handler: this.createBorrelkaartGroup.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: this.isAdmin.bind(this),
          handler: this.returnSingleBorrelkaartGroup.bind(this),
        },
        PATCH: {
          body: { modelName: 'BorrelkaartGroupRequest' },
          policy: this.isAdmin.bind(this),
          handler: this.updateBorrelkaartGroup.bind(this),
        },
        DELETE: {
          policy: this.isAdmin.bind(this),
          handler: this.removeBorrelkaartGroup.bind(this),
        },
      },
    };
  }

  /**
   * Verifies whether the banner request translates to a valid banner object
   * @param br
   */
  // eslint-disable-next-line class-methods-use-this
  private verifyBorrelkaartGroup(bkgr: BorrelkaartGroupRequest): boolean {
    // TODO: verify borrelkaart group
    return bkgr.name !== '';
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  private async isAdmin(req: RequestWithToken): Promise<boolean> {
    // TODO: check whether user is admin
    return req.token.user.type === UserType.LOCAL_ADMIN || true;
  }

  /**
   * Returns all existing BorrelkaartGroups
   * @route GET /borrelkaartgroups
   * @group borrelkaartgroups - Operations of BorrelkaartGroup controller
   * @security JWT
   * @returns {Array<BorrelkaartGroup>} 200 - All existing BorrelkaartGroups without users
   * @returns {string} 500 - Internal server error
   */
  public async returnAllBorrelkaartGroups(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all BorrelkaartGroups', body, 'by user', req.token.user);

    // handle request
    try {
      // return BorrelkaartGroups without users
      const bkgs = await BorrelkaartGroup.find({ ...addPaginationForFindOptions(req) });
      res.json(bkgs);
    } catch (error) {
      this.logger.error('Could not return all BorrelkaartGroups:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a new BorrelkaartGroup
   * @route POST /borrelkaartgroups
   * @group borrelkaartgroups - Operations of BorrelkaartGroup controller
   * @param {BorrelkaartGroupRequest.model} borrelkaartgroup.body.required -
   * The BorrelkaartGroup which should be created
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The created BorrelkaartGroup entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BorrelkaartGroupRequest;
    this.logger.trace('Create BorrelkaartGroup', body, 'by user', req.token.user);

    // handle request
    try {
      if (this.verifyBorrelkaartGroup(body)) {
        // create new BorrelkaartGroup
        const bkgReq = {
          name: body.name,
          activeStartDate: new Date(body.activeStartDate),
          activeEndDate: new Date(body.activeEndDate),
        } as BorrelkaartGroup;
        await BorrelkaartGroup.save(bkgReq);

        // link users to BorrelkaartGroup
        const bkg = await BorrelkaartGroup.findOne({ name: body.name });
        const userLinks: UserBorrelkaartGroup[] = [];
        body.users.forEach((user) => {
          userLinks.push({
            user,
            borrelkaartGroup: bkg,
          } as UserBorrelkaartGroup);
        });
        await UserBorrelkaartGroup.save(userLinks);

        // return created BorrelkaartGroup with users
        const bkgResp = {
          borrelkaartGroup: bkg,
          users: body.users,
        } as BorrelkaartGroupResponse;

        res.json(bkgResp);
      } else {
        res.status(400).json('Invalid BorrelkaartGroup.');
      }
    } catch (error) {
      this.logger.error('Could not create BorrelkaartGroup:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested BorrelkaartGroup
   * @route GET /borrelkaartgroups/{id}
   * @group borrelkaartgroups - Operations of BorrelkaartGroup controller
   * @param {integer} id.path.required - The id of the BorrelkaartGroup which should be returned
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The requested BorrelkaartGroup entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single BorrelkaartGroup', id, 'by user', req.token.user);

    // handle request
    try {
      // check if BorrelkaartGroup in database
      const borrelkaartGroup = await BorrelkaartGroup.findOne(id);
      if (borrelkaartGroup) {
        // return requested BorrelkaartGroup
        res.status(200).json('Joe');
      } else {
        res.status(404).json('BorrelkaartGroup not found.');
      }
    } catch (error) {
      this.logger.error('Could not return BorrelkaartGroup:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Updates the requested BorrelkaartGroup
   * @route PATCH /borrelkaartgroups/{id}
   * @group borrelkaartgroups - Operations of BorrelkaartGroup controller
   * @param {integer} id.path.required - The id of the BorrelkaartGroup which should be updated
   * @param {BorrelkaartGroupRequest.model} borrelkaartgroup.body.required -
   * The updated BorrelkaartGroup
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The requested BorrelkaartGroup entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BorrelkaartGroupRequest;
    const { id } = req.params;
    this.logger.trace('Update BorrelkaartGroup', id, 'by user', req.token.user);

    // handle request
    try {
      if (this.verifyBorrelkaartGroup(body)) {
        // check if BorrelkaartGroup in database
        if (await BorrelkaartGroup.findOne(id)) {
          // update BorrelkaartGroup
          // update users
          // return updated BorrelkaartGroup
          res.status(200).json('Joe');
        } else {
          res.status(404).json('BorrelkaartGroup not found.');
        }
      } else {
        res.status(400).json('Invalid BorrelkaartGroup.');
      }
    } catch (error) {
      this.logger.error('Could not update BorrelkaartGroup:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Deletes the requested BorrelkaartGroup
   * @route DELETE /borrelkaartgroups/{id}
   * @group borrelkaartgroups - Operations of BorrelkaartGroup controller
   * @param {integer} id.path.required - The id of the BorrelkaartGroup which should be deleted
   * @security JWT
   * @returns {BorrelkaartGroupResponse.model} 200 - The deleted BorrelkaartGroup entity
   * @returns {string} 404 - Not found error
   */
  public async removeBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Remove BorrelkaartGroup', id, 'by user', req.token.user);

    // handle request
    try {
      // check if BorrelkaartGroup in database
      const borrelkaartGroup = await BorrelkaartGroup.findOne(id);
      if (borrelkaartGroup) {
        // remove borrelkaart group
        // remove users
        // return deleted BorrelkaartGroup
        res.status(200).json('Joe');
      } else {
        res.status(404).json('BorrelkaartGroup not found.');
      }
    } catch (error) {
      this.logger.error('Could not remove BorrelkaartGroup:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
