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
 */
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import log4js, { Logger } from 'log4js';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination } from '../helpers/pagination';
import { PaginatedWriteOffResponse } from './response/write-off-response';
import WriteOffService, { parseWriteOffFilterParameters } from '../service/write-off-service';
import WriteOff from '../entity/transactions/write-off';
import WriteOffRequest from './request/write-off-request';
import User from '../entity/user/user';
import BalanceService from '../service/balance-service';

export default class WriteOffController extends BaseController {
  private logger: Logger = log4js.getLogger(' WriteOffController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'WriteOff', ['*']),
          handler: this.returnAllWriteOffs.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'WriteOff', ['*']),
          handler: this.createWriteOff.bind(this),
          body: { modelName: 'WriteOffRequest' },
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'WriteOff', ['*']),
          handler: this.getSingleWriteOff.bind(this),
        },
      },
    };
  }


  /**
   * GET /writeoffs
   * @summary Returns all write-offs in the system.
   * @operationId getAllWriteOffs
   * @tags writeoffs - Operations of the writeoffs controller
   * @security JWT
   * @param {integer} toId.query - Filter on Id of the debtor
   * @param {integer} amount.query - Filter on the amount of the write-off
   * @param {integer} take.query - Number of write-offs to return
   * @param {integer} skip.query - Number of write-offs to skip
   * @return {PaginatedWriteOffResponse} 200 - All existing write-offs
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnAllWriteOffs(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all write offs by ', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const filters = parseWriteOffFilterParameters(req);
      const writeOffs: PaginatedWriteOffResponse = await WriteOffService.getWriteOffs(
        filters, { take, skip },
      );
      res.json(writeOffs);
    } catch (error) {
      this.logger.error('Could not return all write offs:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /writeoffs/{id}
   * @summary Get a single write-off
   * @operationId getSingleWriteOff
   * @tags writeoffs - Operations of the writeoff controller
   * @param {integer} id.path.required - The ID of the write-off object that should be returned
   * @security JWT
   * @return {WriteOffResponse} 200 - Single write off with given id
   * @return {string} 404 - Nonexistent write off id
   */
  public async getSingleWriteOff(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single write off', id, 'by user', req.token.user);

    try {
      const writeOffId = parseInt(id, 10);
      const options = WriteOffService.getOptions({ writeOffId });
      const writeOff = await WriteOff.findOne({ ...options });
      if (!writeOff) {
        res.status(404).json('Unknown write off ID.');
        return;
      }

      res.status(200).json(WriteOffService.asWriteOffResponse(writeOff));
    } catch (error) {
      this.logger.error('Could not return single write off:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /writeoffs
   * @summary Creates a new write-off in the system. Creating a write-off will also close and delete the user's account.
   * @operationId createWriteOff
   * @tags writeoffs - Operations of the writeoff controller
   * @param {WriteOffRequest} request.body.required - New write off
   * @security JWT
   * @return {WriteOffResponse} 200 - The created write off.
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error.
   */
  public async createWriteOff(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as WriteOffRequest;
    this.logger.trace('Create write off by user', req.token.user);

    try {
      const user = await User.findOne({ where: { id: body.toId, deleted: false } });
      if (!user) {
        res.status(404).json('User not found.');
        return;
      }

      const balance = await BalanceService.getBalance(user.id);
      if (balance.amount.amount > 0) {
        res.status(400).json('User has balance, cannot create write off');
        return;
      }

      const writeOff = await new WriteOffService().createWriteOffAndCloseUser(user);
      res.status(200).json(writeOff);
    } catch (error) {
      this.logger.error('Could not create write off:', error);
      res.status(500).json('Internal server error.');
    }
  }

}
