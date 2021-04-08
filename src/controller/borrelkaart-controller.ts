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
import User, { UserType } from '../entity/user/user';
import { addPaginationForFindOptions } from '../helpers/pagination';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';

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
  private verifyBorrelkaartGroup(bgr: BorrelkaartGroupRequest): boolean {
    // TODO: verify br.borrelKaarten
    const sDate = Date.parse(bgr.activeStartDate);
    const eDate = Date.parse(bgr.activeEndDate);

    const valueCheck: boolean = bgr.name !== ''
      // check if borrelkaarten exist
      && bgr.borrelkaarten[0] !== null

      // dates should exist
      && !Number.isNaN(sDate)
      && !Number.isNaN(eDate)

      // end date cannot be in the past
      && eDate > new Date().getTime()

      // end date must be later than start date
      && eDate > sDate;

    return valueCheck;
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
   * @returns {Array<BorrelkaartGroup>} 200 - All existing BorrelkaartGroups
   * @returns {string} 500 - Internal server error
   */
  public async returnAllBorrelkaartGroups(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all BorrelkaartGroups', body, 'by user', req.token.user);

    // handle request
    try {
      const borrelkaartGroups = await
      BorrelkaartGroup.find({ ...addPaginationForFindOptions(req) });

      res.json(borrelkaartGroups);
    } catch (error) {
      this.logger.error('Could not return all BorrelkaartGroups:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a new BorrelkaartGroup
   * @route POST /borrelkaartgroups
   * @group borrelkaartgroups - Operations of BorrelkaartGroup controller
   * @param {BorrelkaartGroupRequest.model} BorrelkaartGroup.body.required -
   * The BorrelkaartGroup which should be created
   * @security JWT
   * @returns {BorrelkaartGroup.model} 200 - The created BorrelkaartGroup entity
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
        const borrelkaartGroup: any = {
          name: body.name,
          activeStartDate: new Date(body.activeStartDate),
          activeEndDate: new Date(body.activeEndDate),
        } as BorrelkaartGroup;
        await BorrelkaartGroup.save(borrelkaartGroup);

        // link users to BorrelkaartGroup
        const bkg = await BorrelkaartGroup.findOne({ name: body.name });
        const userBorrelkaartGroup: UserBorrelkaartGroup[] = [];
        await Promise.all(body.borrelkaarten.map(async (usr) => {
          const user = await User.findOne({ ...usr });
          userBorrelkaartGroup.push({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup);
        }));
        await UserBorrelkaartGroup.save(userBorrelkaartGroup);

        res.json(borrelkaartGroup);
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
   * @returns {BorrelkaartGroup.model} 200 - The requested BorrelkaartGroup entity
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
        // TODO: return users as well
        res.json(borrelkaartGroup);
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
   * @param {BorrelkaartGroupRequest.model} BorrelkaartGroup.body.required -
   * The updated BorrelkaartGroup
   * @security JWT
   * @returns {BorrelkaartGroup.model} 200 - The requested BorrelkaartGroup entity
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
          const borrelkaartGroup: any = {
            name: body.name,
            activeStartDate: new Date(body.activeStartDate),
            activeEndDate: new Date(body.activeEndDate),
          } as BorrelkaartGroup;
          await BorrelkaartGroup.update(id, borrelkaartGroup);

          // TODO: update users
          res.json(borrelkaartGroup);
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
   * @returns {BorrelkaartGroup.model} 200 - The deleted BorrelkaartGroup entity
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
        await BorrelkaartGroup.delete(id);

        // TODO: remove users
        res.json(borrelkaartGroup);
      } else {
        res.status(404).json('BorrelkaartGroup not found.');
      }
    } catch (error) {
      this.logger.error('Could not remove BorrelkaartGroup:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
