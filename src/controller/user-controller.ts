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
import { RequestWithToken } from '../middleware/token-middleware';
import User from '../entity/user';

export default class UserController extends BaseController {
  private logger: Logger = log4js.getLogger('UserController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: this.canGetAllUsers.bind(this),
          handler: this.getAllUsers.bind(this),
        },
      },
      '/:id': {
        GET: {
          policy: this.canGetIndividualUser.bind(this),
          handler: this.getIndividualUser.bind(this),
        },
      },
    };
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  public async canGetAllUsers(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  public async canGetIndividualUser(req: RequestWithToken): Promise<boolean> {
    return req.params.id === req.token.user.id.toString();
  }

  /**
   * Get a list of all users
   * @route GET /users
   * @group users - Operations of user controller
   * @returns {[User.model]} 200 - A list of all users
   */
  public async getAllUsers(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all users', 'by user', req.token.user);

    const users = await User.find();
    res.status(200).json(users);
  }

  /**
   * Get an individual user
   * @route GET /users/:id
   * @group users - Operations of user controller
   * @returns {User.model} 200 - Individual user
   * @returns {string} 404 - Nonexistent user id
   */
  public async getIndividualUser(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get individual user', parameters, 'by user', req.token.user);

    // Get the user object if it exists
    const user = await User.findOne(parameters.id);
    // If it does not exist, return a 404 error
    if (user === undefined) {
      res.status(404).json('Unknown user ID.');
      return;
    }

    res.status(200).json(user);
  }
}
