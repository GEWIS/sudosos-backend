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
import User from '../entity/user/user';
import { addPaginationForFindOptions } from '../helpers/pagination';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';
import BorrelkaartGroupResponse from './response/borrelkaart-group-response';
import AuthService from '../services/AuthService';
import BorrelkaartGroupService from '../services/BorrelkaartGroupService';

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
          policy: AuthService.isAdmin.bind(this),
          handler: this.returnAllBorrelkaartGroups.bind(this),
        },
        POST: {
          body: { modelName: 'BorrelkaartGroupRequest' },
          policy: AuthService.isAdmin.bind(this),
          handler: this.createBorrelkaartGroup.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: AuthService.isAdmin.bind(this),
          handler: this.returnSingleBorrelkaartGroup.bind(this),
        },
        PATCH: {
          body: { modelName: 'BorrelkaartGroupRequest' },
          policy: AuthService.isAdmin.bind(this),
          handler: this.updateBorrelkaartGroup.bind(this),
        },
        DELETE: {
          policy: AuthService.isAdmin.bind(this),
          handler: this.removeBorrelkaartGroup.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing borrelkaart groups
   * @route GET /borrelkaartgroups
   * @group borrelkaartgroups - Operations of borrelkaart group controller
   * @security JWT
   * @returns {Array<BorrelkaartGroup>} 200 - All existingborrelkaart groups without users
   * @returns {string} 500 - Internal server error
   */
  public async returnAllBorrelkaartGroups(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all borrelkaart groups', body, 'by user', req.token.user);

    // handle request
    try {
      // return borrelkaart groups without users
      const bkgs = await BorrelkaartGroup.find({ ...addPaginationForFindOptions(req) });
      res.json(bkgs);
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
   * @returns {string} 500 - Internal server error
   */
  public async createBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BorrelkaartGroupRequest;
    this.logger.trace('Create borrelkaart group', body, 'by user', req.token.user);

    // handle request
    try {
      if (await BorrelkaartGroupService.verifyBorrelkaartGroup(body)) {
        // create new borrelkaart group
        const bkgReq = {
          name: body.name,
          activeStartDate: new Date(body.activeStartDate),
          activeEndDate: new Date(body.activeEndDate),
        } as BorrelkaartGroup;
        await BorrelkaartGroup.save(bkgReq);

        // find borrelkaart group as put in database
        const bkg = await BorrelkaartGroup.findOne({ name: body.name });

        // get all users in the request from the database
        const users = await Promise.all(body.users.map((user) => User.findOne(user.id)));

        // create links between user and borrelkaart group
        const userLinks: UserBorrelkaartGroup[] = users
          .map((user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup));

        // save user borrelkaart group link
        await UserBorrelkaartGroup.save(userLinks);

        // return created borrelkaart group with users
        const bkgResp = {
          ...bkg,
          createdAt: bkg.createdAt.toISOString(),
          updatedAt: bkg.updatedAt.toISOString(),
          activeStartDate: bkg.activeStartDate.toISOString(),
          activeEndDate: bkg.activeEndDate.toISOString(),
          users,
        } as BorrelkaartGroupResponse;

        res.json(bkgResp);
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
  public async returnSingleBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single borrelkaart group', id, 'by user', req.token.user);

    // handle request
    try {
      // check if borrelkaart group in database
      const bkg = await BorrelkaartGroup.findOne(id);
      if (bkg) {
        // get users related to borrelkaart group
        const userBorrelkaartGroups = await UserBorrelkaartGroup.find({
          relations: ['user'],
          where: { borrelkaartGroup: bkg },
        });
        const users = userBorrelkaartGroups.map((ubkg) => ubkg.user);

        // return requested borrelkaart group and users
        const bkgResp = {
          ...bkg,
          createdAt: bkg.createdAt.toISOString(),
          updatedAt: bkg.updatedAt.toISOString(),
          activeStartDate: bkg.activeStartDate.toISOString(),
          activeEndDate: bkg.activeEndDate.toISOString(),
          users,
        } as BorrelkaartGroupResponse;

        res.json(bkgResp);
      } else {
        res.status(404).json('Borrelkaart group not found.');
      }
    } catch (error) {
      this.logger.error('Could not return borrelkaart group:', error);
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
        // check if borrelkaart group in database
        if (await BorrelkaartGroup.findOne(id)) {
          // create update borrelkaart group
          // patch users to borrelkaart group
          // return created borrelkaart group with users
          res.status(200).json('Joe');
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
  public async removeBorrelkaartGroup(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Remove borrelkaart group', id, 'by user', req.token.user);

    // handle request
    try {
      // check if borrelkaart group in database
      const borrelkaartGroup = await BorrelkaartGroup.findOne(id);
      if (borrelkaartGroup) {
        // remove borrelkaart group
        // remove users
        // return deleted borrelkaart group
        res.status(200).json('Joe');
      } else {
        res.status(404).json('Borrelkaart group not found.');
      }
    } catch (error) {
      this.logger.error('Could not remove borrelkaart group:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
