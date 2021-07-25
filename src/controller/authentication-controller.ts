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
import User from '../entity/user/user';
import AuthenticationMockRequest from './request/authentication-mock-request';
import JsonWebToken from '../authentication/json-web-token';
import TokenHandler from '../authentication/token-handler';
import AuthenticationResponse from './response/authentication-response';
import { UserResponse } from './response/user-response';

/**
 * The authentication controller is responsible for:
 * - Verifying user authentications.
 * - Handing out json web tokens.
 */
export default class AuthenticationController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: Logger = log4js.getLogger('AuthenticationController');

  /**
   * Reference to the token handler of the application.
   */
  private tokenHandler: TokenHandler;

  /**
   * Creates a new authentication controller instance.
   * @param options - The options passed to the base controller.
   * @param tokenHandler - The token handler for creating signed tokens.
   */
  public constructor(
    options: BaseControllerOptions,
    tokenHandler: TokenHandler,
  ) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.tokenHandler = tokenHandler;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/mock': {
        POST: {
          body: { modelName: 'AuthenticationMockRequest' },
          policy: this.canPerformMock.bind(this),
          handler: this.mockLogin.bind(this),
        },
      },
    };
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canPerformMock(req: Request): Promise<boolean> {
    const body = req.body as AuthenticationMockRequest;

    // Only allow in development setups
    if (process.env.NODE_ENV !== 'development') return false;

    // Check the existence of the user
    const user = await User.findOne({ id: body.userId });
    if (!user) return false;

    return true;
  }

  /**
   * Mock login and hand out token.
   * @route POST /authentication/mock
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationMockRequest.model} req.body.required - The mock login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   */
  public async mockLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationMockRequest;
    this.logger.trace('Mock authentication for user', body.userId);

    try {
      const user = await User.findOne({ id: body.userId });
      const roles = await this.roleManager.getRoles(user);

      const contents: JsonWebToken = {
        user,
        roles,
      };
      const token = await this.tokenHandler.signToken(contents, body.nonce);

      const userResponse = { ...user } as unknown as UserResponse;
      const response: AuthenticationResponse = {
        user: userResponse,
        roles,
        token,
      };
      res.json(response);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
