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
import { SwaggerSpecification } from 'swagger-model-validator';
import BaseController from './base-controller';
import Policy from './policy';
import AuthenticationMockRequest from './request/authentication-mock-request';
import TokenHandler from '../authentication/token-handler';

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
   * @param spec - The Swagger specification used for model validation.
   * @param tokenHandler - The token handler for creating signed tokens.
   */
  public constructor(spec: SwaggerSpecification, tokenHandler: TokenHandler) {
    super(spec);
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
    return true;
  }

  /**
   * Mock login and hand out token.
   * @route POST /authentication/mock
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationMockRequest.model} request.body.required - The mock login.
   * @returns {string} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   */
  public async mockLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationMockRequest;
    this.logger.trace('Mock authentication for user', body.userId);

    try {
      res.status(500).json('Not implemented');
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
