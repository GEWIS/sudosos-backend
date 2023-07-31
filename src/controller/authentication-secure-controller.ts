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
import AuthenticationService from '../service/authentication-service';
import TokenHandler from '../authentication/token-handler';
import User from '../entity/user/user';

export default class AuthenticationSecureController extends BaseController {
  private logger: Logger = log4js.getLogger('AuthenticationController');

  /**
   * Reference to the token handler of the application.
   */
  protected tokenHandler: TokenHandler;

  /**
   * Creates a new banner controller instance.
   * @param options - The options passed to the base controller.
   * @param tokenHandler - The token handler for creating signed tokens.
   */
  public constructor(options: BaseControllerOptions, tokenHandler: TokenHandler) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.tokenHandler = tokenHandler;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/refreshToken': {
        GET: {
          policy: async () => Promise.resolve(true),
          handler: this.refreshToken.bind(this),
          restrictions: { lesser: true, acceptedTOS: false },
        },
      },
    };
  }

  /**
   * Get a new JWT token, lesser if the existing token is also lesser
   * @route get /authentication/refreshToken
   * @operationId refreshToken
   * @group authenticate - Operations of the authentication controller
   * @security JWT
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   */
  private async refreshToken(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Refresh token for user', req.token.user.id);

    try {
      const user = await User.findOne({ where: { id: req.token.user.id } });
      const token = await AuthenticationService.getSaltedToken(user, {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      }, req.token.lesser);
      res.json(token);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
