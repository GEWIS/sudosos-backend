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
import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import ActionResponse from './response/rbac/action-response';
import EntityResponse from './response/rbac/entity-response';
import RelationResponse from './response/rbac/relation-response';
import RoleResponse from './response/rbac/role-response';

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
   * Returns all existing roles
   * @route GET /rbac/roles
   * @group rbac - Operations of rbac controller
   * @returns {Array.<RoleResponse>} 200 - All existing roles
   * @returns {string} 500 - Internal server error
   */
  public async returnAllRoles(req: Request, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all roles', body);

    // handle request
    try {
      const roles = this.roleManager.getRegisteredRoles();

      // Map every role to response
      const responses = Object.keys(roles).map((roleName): RoleResponse => {
        const role = roles[roleName];
        return {
          role: roleName,
          // Map every entity permission to response
          entities: Object.keys(role.permissions).map((entityName): EntityResponse => {
            const entity = role.permissions[entityName];
            return {
              entity: entityName,
              // Map every action permission to response
              actions: Object.keys(entity).map((actionName): ActionResponse => {
                const action = entity[actionName];
                return {
                  action: actionName,
                  // Map every relation permission to response
                  relations: Object.keys(action).map((relationName): RelationResponse => ({
                    relation: relationName,
                    attributes: [...action[relationName]],
                  })),
                };
              }),
            };
          }),
        };
      });
      res.json(responses);
    } catch (error) {
      this.logger.error('Could not return all roles:', error);
      res.status(500).json('Internal server error.');
    }
  }
}