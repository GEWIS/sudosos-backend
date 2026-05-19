/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

/**
 * This is the module page of the terminal payment controller
 * 
 * @module terminal-payment
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import Dinero from 'dinero.js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';

export default class TerminalPaymentController extends BaseController {
  private logger: Logger = log4js.getLogger('TerminalPaymentController');

  /**
   * Create a new stripe controller instance
   * @param options
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'TerminalPayment', ['*'],
          ),
          handler: this.createTerminalPayment.bind(this),
          body: { modelName: 'CreateTerminalPaymentRequest' },
        }
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', await TerminalPaymentController.getRelation(req), 'TerminalPayment', ['*'],
          ),
          handler: this.getTerminalPayment.bind(this),
        },
      },
      '/:id(\\d+)/process': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'TerminalPayment', ['*'],
          ),
          handler: this.startTerminalPayment.bind(this),
          body: { modelName: 'ProcessTerminalPaymentRequest' }
        }
      }
    }
  }

  /**
   * POST /terminal-payment
   * 
   */
  public async createTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Create new terminal payment by user', req.token.user);
  }

  public async getTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get terminal payment with id', req.params.id, 'by user', req.token.user);
  }

  public async startTerminalPayment(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Start terminal payment by user', req.token.user);
  }

  private static async getRelation(req: RequestWithToken): Promise<string> {
    // @TODO implement
    return 'all';
  }
}