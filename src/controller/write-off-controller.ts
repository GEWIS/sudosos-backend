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
import BaseController, { BaseControllerOptions } from './base-controller';
import log4js, { Logger } from 'log4js';
import Policy from './policy';

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
          body: { modelName: 'CreateWriteOffRequest' },
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'WriteOff', ['*']),
          handler: this.returnSingleWriteOff.bind(this),
        },
      },
    };
  }
}
