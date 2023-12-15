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
import { VoucherGroupRequest } from './request/voucher-group-request';
import { RequestWithToken } from '../middleware/token-middleware';
import VoucherGroup from '../entity/user/voucher-group';
import VoucherGroupService from '../service/voucher-group-service';
import { parseRequestPagination } from '../helpers/pagination';

export default class VoucherGroupController extends BaseController {
  private logger: Logger = log4js.getLogger('VoucherGroupController');

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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'VoucherGroup', ['*']),
          handler: this.getAllVoucherGroups.bind(this),
        },
        POST: {
          body: { modelName: 'VoucherGroupRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'VoucherGroup', ['*']),
          handler: this.createVoucherGroup.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'VoucherGroup', ['*']),
          handler: this.getVoucherGroupById.bind(this),
        },
        PATCH: {
          body: { modelName: 'VoucherGroupRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'VoucherGroup', ['*']),
          handler: this.updateVoucherGroup.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing voucher groups
   * @route GET /vouchergroups
   * @operationId getAllVouchergroups
   * @group vouchergroups - Operations of voucher group controller
   * @security JWT
   * @param {integer} take.query - How many voucher groups the endpoint should return
   * @param {integer} skip.query - How many voucher groups should be skipped (for pagination)
   * @returns {PaginatedVoucherGroupResponse.model} 200 - All existingvoucher
   * groups without users
   * @returns {string} 500 - Internal server error
   */
  public async getAllVoucherGroups(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all voucher groups', body, 'by user', req.token.user);

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
      res.json(await VoucherGroupService.getVoucherGroups({}, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all voucher groups:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a new voucher group
   * @route POST /vouchergroups
   * @operationId createVouchergroup
   * @group vouchergroups - Operations of voucher group controller
   * @param {VoucherGroupRequest.model} vouchergroup.body.required -
   * The voucher group which should be created
   * @security JWT
   * @returns {VoucherGroupResponse.model} 200 - The created voucher group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createVoucherGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as VoucherGroupRequest;
    this.logger.trace('Create voucher group', body, 'by user', req.token.user);

    const voucherGroupParams = VoucherGroupService.asVoucherGroupParams(body);

    // handle request
    try {
      if (!VoucherGroupService.validateVoucherGroup(voucherGroupParams)) {
        res.status(400).json('Invalid voucher group.');
        return;
      }
      res.json(await VoucherGroupService.createVoucherGroup(voucherGroupParams));
    } catch (error) {
      this.logger.error('Could not create voucher group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested voucher group
   * @route GET /vouchergroups/{id}
   * @operationId getVouchergroupId
   * @group vouchergroups - Operations of voucher group controller
   * @param {integer} id.path.required - The id of the voucher group which should be returned
   * @security JWT
   * @returns {VoucherGroupResponse.model} 200 - The requested voucher group entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getVoucherGroupById(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const bkgId = Number.parseInt(id, 10);
    this.logger.trace('Get single voucher group', id, 'by user', req.token.user);

    // handle request
    try {
      const bkg = await VoucherGroupService.getVoucherGroups({ bkgId });
      if (bkg.records[0]) {
        res.json(bkg.records[0]);
      } else {
        res.status(404).json('Voucher group not found.');
      }
    } catch (error) {
      this.logger.error('Could not get voucher group:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Updates the requested voucher group
   * @route PATCH /vouchergroups/{id}
   * @operationId updateVoucherGroup
   * @group vouchergroups - Operations of voucher group controller
   * @param {integer} id.path.required - The id of the voucher group which should be updated
   * @param {VoucherGroupRequest.model} vouchergroup.body.required -
   * The updated voucher group
   * @security JWT
   * @returns {VoucherGroupResponse.model} 200 - The requested voucher group entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateVoucherGroup(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as VoucherGroupRequest;
    const { id } = req.params;
    const bkgId = Number.parseInt(id, 10);
    this.logger.trace('Update voucher group', id, 'with', body, 'by user', req.token.user);

    const voucherGroupParams = VoucherGroupService.asVoucherGroupParams(body);

    // handle request
    try {
      if (!VoucherGroupService.validateVoucherGroup(voucherGroupParams)) {
        res.status(400).json('Invalid voucher group.');
        return;
      }
      const bkg = await VoucherGroup.findOne({ where: { id: bkgId } });
      if (!bkg) {
        res.status(404).json('Voucher group not found.');
        return;
      }
      if (bkg.activeStartDate <= new Date()) {
        res.status(403).json('Voucher StartDate has already passed.');
        return;
      }
      if (voucherGroupParams.amount < bkg.amount) {
        res.status(400).json('Cannot decrease number of VoucherGroupUsers');
        return;
      }
      res.status(200).json(
        await VoucherGroupService.updateVoucherGroup(bkgId, voucherGroupParams),
      );
    } catch (error) {
      this.logger.error('Could not update voucher group:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
