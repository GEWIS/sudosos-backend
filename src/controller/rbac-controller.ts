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

import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import RBACService from '../service/rbac-service';
import Role from '../entity/rbac/role';

export default class RbacController extends BaseController {
  private logger: Logger = log4js.getLogger('RbacController');

  /**
   * Creates a new rbac controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/roles': {
        GET: {
          policy: async () => true,
          handler: this.returnAllRoles.bind(this),
        },
      },
    };
  }

  /**
   * GET /rbac/roles
   * @summary Returns all existing roles
   * @operationId getAllRoles
   * @tags rbac - Operations of rbac controller
   * @security JWT
   * @return {Array.<RoleResponse>} 200 - All existing roles
   * @return {string} 500 - Internal server error
   */
  public async returnAllRoles(req: Request, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all roles', body);

    // handle request
    try {
      const roles = await Role.find({ relations: { permissions: true } });

      // Map every role to response
      const responses = RBACService.asRoleResponse(roles);
      res.json(responses);
    } catch (error) {
      this.logger.error('Could not return all roles:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
