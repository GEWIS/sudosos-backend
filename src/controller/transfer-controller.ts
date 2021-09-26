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
import { RequestWithToken } from '../middleware/token-middleware';
import TransferService from '../service/transfer-service';

export default class TransferController extends BaseController {
  private logger: Logger = log4js.getLogger('TransferController');

  /**
   * Creates a new transfer controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transfer', ['*']),
          handler: this.returnAllTransfers.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing transfers
   * @route GET /transfers
   * @group transfers - Operations of transfer controller
   * @security JWT
   * @returns {Array<TransferResponse>} 200 - All existing transfers
   * @returns {string} 500 - Internal server error
   */
  public async returnAllTransfers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all transfers', body, 'by user', req.token.user);
    try {
      const transfers = await TransferService.getTransfers();
      res.json(transfers);
    } catch (error) {
      this.logger.error('Could not return all transfers:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
